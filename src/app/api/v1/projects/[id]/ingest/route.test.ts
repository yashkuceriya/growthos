import { beforeEach, describe, expect, it, vi } from 'vitest'

const authenticateApiKeyMock = vi.fn()
const enforceRateLimitMock = vi.fn()
const withIdempotencyMock = vi.fn()
const checkBudgetMock = vi.fn()
const runIngestMock = vi.fn()
const enqueueIngestMock = vi.fn()

interface State {
  project: { id: string; user_id: string; website: string | null } | null
}

const state: State = {
  project: null,
}

vi.mock('@/lib/api-auth', () => ({
  authenticateApiKey: (...args: unknown[]) => authenticateApiKeyMock(...args),
}))

vi.mock('@/lib/rate-limit-api', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
  attachRateLimitHeaders: (response: Response, outcome: { ok: boolean; headers?: Record<string, string> }) => {
    if (outcome.ok && outcome.headers) {
      for (const [k, v] of Object.entries(outcome.headers)) response.headers.set(k, v)
    }
    return response
  },
}))

vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (...args: unknown[]) => withIdempotencyMock(...args),
}))

vi.mock('@/lib/budget-guard', () => ({
  checkBudget: (...args: unknown[]) => checkBudgetMock(...args),
  budgetExceededResponse: (status: { unavailable?: boolean }) => Response.json(
    { error: status.unavailable ? 'Budget guard temporarily unavailable' : 'Monthly AI budget exceeded' },
    { status: status.unavailable ? 503 : 402 },
  ),
}))

vi.mock('@/lib/ai/intelligence/ingest', () => ({
  runIngest: (...args: unknown[]) => runIngestMock(...args),
}))

vi.mock('@/lib/jobs/ingest-queue', () => ({
  enqueueIngest: (...args: unknown[]) => enqueueIngestMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'projects') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.project, error: null }),
          }),
        }),
      }
    },
  }),
}))

import { POST } from './route'

beforeEach(() => {
  authenticateApiKeyMock.mockReset()
  enforceRateLimitMock.mockReset()
  withIdempotencyMock.mockReset()
  checkBudgetMock.mockReset()
  runIngestMock.mockReset()
  enqueueIngestMock.mockReset()

  state.project = {
    id: 'proj_1',
    user_id: 'user_1',
    website: 'https://example.com',
  }

  authenticateApiKeyMock.mockResolvedValue({
    ok: true,
    userId: 'user_1',
    keyId: 'key_1',
    scopes: ['projects:ingest'],
  })
  enforceRateLimitMock.mockResolvedValue({
    ok: true,
    remaining: 10,
    limit: 60,
    headers: { 'x-ratelimit-remaining': '10' },
  })
  withIdempotencyMock.mockImplementation(async (args: { handler: () => Promise<Response> }) => args.handler())
  checkBudgetMock.mockResolvedValue({ ok: true, spent: 1, cap: 100, remaining: 99 })
  enqueueIngestMock.mockResolvedValue({ id: 'job_1' })
  runIngestMock.mockResolvedValue({ brand: { tagline: 'Hello' } })
})

function ingestRequest(body: Record<string, unknown> = {}, search = '') {
  return new Request(`https://app.test/api/v1/projects/proj_1/ingest${search}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer gos_live_test',
      'idempotency-key': 'idem_1',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/projects/:id/ingest', () => {
  it('queues an ingest job by default', async () => {
    const res = await POST(ingestRequest())
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('10')
    expect(body).toEqual({
      status: 'queued',
      job_id: 'job_1',
      project_id: 'proj_1',
      poll_url: '/api/v1/jobs/job_1',
    })
    expect(enqueueIngestMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      projectId: 'proj_1',
      url: 'https://example.com',
    }))
  })

  it('runs synchronously when requested', async () => {
    const res = await POST(ingestRequest({ sync: true, url: 'https://override.example' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      status: 'ok',
      project_id: 'proj_1',
      brand: { tagline: 'Hello' },
    })
    expect(runIngestMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      projectId: 'proj_1',
      url: 'https://override.example',
    }))
    expect(enqueueIngestMock).not.toHaveBeenCalled()
  })

  it('rejects projects not owned by the API key user', async () => {
    state.project = { id: 'proj_1', user_id: 'someone_else', website: 'https://example.com' }

    const res = await POST(ingestRequest())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatch(/not found/i)
    expect(checkBudgetMock).not.toHaveBeenCalled()
  })

  it('returns budget failure before enqueueing', async () => {
    checkBudgetMock.mockResolvedValueOnce({ ok: false, spent: 101, cap: 100, remaining: -1 })

    const res = await POST(ingestRequest())
    const body = await res.json()

    expect(res.status).toBe(402)
    expect(body.error).toBe('Monthly AI budget exceeded')
    expect(enqueueIngestMock).not.toHaveBeenCalled()
    expect(runIngestMock).not.toHaveBeenCalled()
  })

  it('requires a target URL', async () => {
    state.project = { id: 'proj_1', user_id: 'user_1', website: null }

    const res = await POST(ingestRequest())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/no url/i)
  })
})
