// State-machine tests for the ingest job queue. We stub runIngest +
// checkBudget and assert the row transitions: claim, completion path,
// permanent-fail path (bot wall), transient-fail path (5xx → requeue),
// and exhaustion (transient at MAX_INGEST_ATTEMPTS → fail).

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/ai/intelligence/ingest', () => ({
  runIngest: vi.fn(),
}))
vi.mock('@/lib/budget-guard', () => ({
  checkBudget: vi.fn(),
}))

import { runIngestJob, recoverStuckJobs, MAX_INGEST_ATTEMPTS, STUCK_RUNNING_TIMEOUT_MS } from './ingest-queue'
import type { IngestJob } from './ingest-queue'
import { runIngest } from '@/lib/ai/intelligence/ingest'
import { checkBudget } from '@/lib/budget-guard'

interface StoredJob extends IngestJob {}

function makeFakeSupabase(opts: { job: StoredJob; refuseClaim?: boolean }) {
  let refuseNextClaim = !!opts.refuseClaim
  const job = opts.job

  type Resolver = () => Promise<{ data: unknown; error: null }>
  function chain(resolver: Resolver): Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> {
    const proxy: Record<string, unknown> = {}
    proxy.eq = () => chain(resolver)
    proxy.select = () => chain(resolver)
    proxy.maybeSingle = () => Promise.resolve({ data: null, error: null }).then(resolver)
    proxy.single = () => Promise.resolve({ data: null, error: null }).then(resolver)
    ;(proxy as unknown as PromiseLike<{ data: unknown; error: null }>).then = (res, rej) =>
      resolver().then(res, rej)
    return proxy as Record<string, unknown> & PromiseLike<{ data: unknown; error: null }>
  }

  return {
    from: (table: string) => {
      if (table !== 'ingest_jobs') throw new Error(`unexpected table: ${table}`)
      return {
        update: (patch: Partial<StoredJob>) => {
          // First UPDATE call is the claim. Subsequent ones are status writes.
          const isClaim = patch.status === 'running'
          if (isClaim && refuseNextClaim) {
            refuseNextClaim = false
            return chain(async () => ({ data: null, error: null }))
          }
          // Apply patch in-place so later assertions see final state.
          Object.assign(job, patch)
          return chain(async () => ({ data: job, error: null }))
        },
      }
    },
  }
}

function baseJob(overrides: Partial<IngestJob> = {}): IngestJob {
  return {
    id: 'job-1',
    user_id: 'user-1',
    project_id: 'project-1',
    url: 'https://example.com',
    status: 'queued',
    attempts: 0,
    error: null,
    result: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(runIngest).mockReset()
  vi.mocked(checkBudget).mockReset()
  vi.mocked(checkBudget).mockResolvedValue({ ok: true, spent: 0, cap: null, remaining: null })
})

describe('runIngestJob', () => {
  it('completes on happy path', async () => {
    const job = baseJob()
    const supabase = makeFakeSupabase({ job })
    vi.mocked(runIngest).mockResolvedValue({ brand: { tagline: 'Hi' } })

    const result = await runIngestJob(supabase as unknown as Parameters<typeof runIngestJob>[0], job)

    expect(result.finalStatus).toBe('completed')
    expect(job.status).toBe('completed')
    expect(job.result).toEqual({ brand: { tagline: 'Hi' } })
    expect(job.completed_at).not.toBeNull()
    expect(job.error).toBeNull()
  })

  it('skips when claim is lost to another worker', async () => {
    const job = baseJob()
    const supabase = makeFakeSupabase({ job, refuseClaim: true })

    const result = await runIngestJob(supabase as unknown as Parameters<typeof runIngestJob>[0], job)

    expect(result.finalStatus).toBe('skipped')
    expect(runIngest).not.toHaveBeenCalled()
  })

  it('fails immediately on permanent error (bot wall)', async () => {
    const job = baseJob()
    const supabase = makeFakeSupabase({ job })
    vi.mocked(runIngest).mockRejectedValue(new Error('Failed to fetch site: 403 — bot wall'))

    const result = await runIngestJob(supabase as unknown as Parameters<typeof runIngestJob>[0], job)

    expect(result.finalStatus).toBe('failed')
    expect(job.status).toBe('failed')
    expect(job.error).toContain('Failed to fetch site')
  })

  it('requeues on transient error before exhaustion', async () => {
    const job = baseJob({ attempts: 0 })
    const supabase = makeFakeSupabase({ job })
    vi.mocked(runIngest).mockRejectedValue(new Error('OpenRouter timeout'))

    const result = await runIngestJob(supabase as unknown as Parameters<typeof runIngestJob>[0], job)

    expect(result.finalStatus).toBe('queued')
    expect(job.status).toBe('queued')
    expect(job.error).toBe('OpenRouter timeout')
    expect(job.started_at).toBeNull()
    // Claim incremented attempts; requeue must NOT reset it, otherwise the
    // ceiling is unreachable and a flaky URL retries forever.
    expect(job.attempts).toBe(1)
  })

  it('fails on transient error at exhaustion', async () => {
    // attempts starts at MAX-1; claim increments to MAX; exhausted check uses
    // the post-claim value (claimed.attempts >= MAX).
    const job = baseJob({ attempts: MAX_INGEST_ATTEMPTS - 1 })
    const supabase = makeFakeSupabase({ job })
    vi.mocked(runIngest).mockRejectedValue(new Error('OpenRouter timeout'))

    const result = await runIngestJob(supabase as unknown as Parameters<typeof runIngestJob>[0], job)

    expect(result.finalStatus).toBe('failed')
    expect(job.status).toBe('failed')
    expect(job.attempts).toBe(MAX_INGEST_ATTEMPTS)
  })

  it('fails when budget is exceeded after claim', async () => {
    const job = baseJob()
    const supabase = makeFakeSupabase({ job })
    vi.mocked(checkBudget).mockResolvedValue({ ok: false, spent: 100, cap: 50, remaining: -50 })

    const result = await runIngestJob(supabase as unknown as Parameters<typeof runIngestJob>[0], job)

    expect(result.finalStatus).toBe('failed')
    expect(job.status).toBe('failed')
    expect(job.error).toContain('budget')
    expect(runIngest).not.toHaveBeenCalled()
  })
})

describe('recoverStuckJobs', () => {
  function makeStuckSweeper(stuckRows: Array<{ id: string; attempts: number }>) {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
    type Resolver = () => Promise<{ data: unknown; error: null }>
    function chain(resolver: Resolver): Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> {
      const proxy: Record<string, unknown> = {}
      proxy.eq = () => chain(resolver)
      proxy.lt = () => chain(resolver)
      proxy.select = () => chain(resolver)
      ;(proxy as unknown as PromiseLike<{ data: unknown; error: null }>).then = (res, rej) =>
        resolver().then(res, rej)
      return proxy as Record<string, unknown> & PromiseLike<{ data: unknown; error: null }>
    }

    let pendingUpdate: { id?: string; patch?: Record<string, unknown> } = {}

    return {
      supabase: {
        from: (table: string) => {
          if (table !== 'ingest_jobs') throw new Error(`unexpected table: ${table}`)
          return {
            select: () => chain(async () => ({ data: stuckRows, error: null })),
            update: (patch: Record<string, unknown>) => {
              pendingUpdate = { patch }
              const eqProxy: Record<string, unknown> = {}
              const inner: Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> = chain(async () => {
                if (pendingUpdate.id && pendingUpdate.patch) {
                  updates.push({ id: pendingUpdate.id, patch: pendingUpdate.patch })
                }
                pendingUpdate = {}
                return { data: null, error: null }
              })
              eqProxy.eq = (col: string, val: string) => {
                if (col === 'id') pendingUpdate.id = val
                return inner
              }
              return eqProxy
            },
          }
        },
      },
      updates,
    }
  }

  it('requeues stuck running jobs that have attempts left', async () => {
    const { supabase, updates } = makeStuckSweeper([{ id: 'a', attempts: 1 }])
    const result = await recoverStuckJobs(supabase as unknown as Parameters<typeof recoverStuckJobs>[0])

    expect(result.requeued).toBe(1)
    expect(result.failed).toBe(0)
    expect(updates).toHaveLength(1)
    expect(updates[0]!.patch.status).toBe('queued')
    expect(updates[0]!.patch.error).toContain('Worker timed out')
  })

  it('marks stuck jobs failed when attempts ceiling is hit', async () => {
    const { supabase, updates } = makeStuckSweeper([{ id: 'b', attempts: MAX_INGEST_ATTEMPTS }])
    const result = await recoverStuckJobs(supabase as unknown as Parameters<typeof recoverStuckJobs>[0])

    expect(result.requeued).toBe(0)
    expect(result.failed).toBe(1)
    expect(updates[0]!.patch.status).toBe('failed')
    expect(updates[0]!.patch.completed_at).toBeTruthy()
  })

  it('returns zeros when nothing is stuck', async () => {
    const { supabase, updates } = makeStuckSweeper([])
    const result = await recoverStuckJobs(supabase as unknown as Parameters<typeof recoverStuckJobs>[0])

    expect(result).toEqual({ requeued: 0, failed: 0 })
    expect(updates).toHaveLength(0)
  })

  it('uses a non-zero stuck threshold (sanity check)', () => {
    expect(STUCK_RUNNING_TIMEOUT_MS).toBeGreaterThan(60_000)
  })
})
