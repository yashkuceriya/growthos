// Idempotency middleware tests. Each case configures a small fake Supabase
// (with a single row of state) and asserts the handler's call count plus
// the response shape — that's the contract: idempotent retries should not
// re-invoke the handler, mismatches must be loud, and failures must not
// poison the cache for future retries.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  withIdempotency,
  hashRequest,
  PROCESSING_STALE_MS,
  RESPONSE_BODY_CAP,
  REPLAY_HEADER,
  TTL_HOURS,
} from './idempotency'

// ── Fake supabase ──────────────────────────────────────────────────────

interface FakeRecord {
  api_key_id: string
  key: string
  request_hash: string
  status: 'processing' | 'completed'
  response_status: number | null
  response_body: string | null
  created_at: string
  completed_at: string | null
}

interface Op {
  kind: 'select' | 'insert' | 'update' | 'delete'
  patch?: Record<string, unknown>
}

interface FakeOptions {
  /** When true, the next insert returns a 23505 unique_violation. */
  insertConflict?: boolean
  /** When true, the next insert returns a generic DB error. */
  insertGenericError?: boolean
  /** When set, the row that an insert-conflict's re-fetch sees (simulates the winner). */
  conflictWinner?: FakeRecord | null
}

function makeFakeSupabase(initial: FakeRecord | null = null, options: FakeOptions = {}) {
  let row: FakeRecord | null = initial
  const ops: Op[] = []
  let nextInsertConflict = !!options.insertConflict
  let nextInsertGenericError = !!options.insertGenericError
  const conflictWinner = options.conflictWinner
  // The conflict winner is only "visible" AFTER the failing insert — i.e.
  // on the production code's re-fetch. We expose it via a flag the mock
  // flips when the insert returns 23505.
  let insertConflicted = false

  type Resolver = () => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
  function chain(resolver: Resolver): Record<string, unknown> & PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
    const proxy: Record<string, unknown> = {}
    proxy.eq = () => chain(resolver)
    proxy.gt = () => chain(resolver)
    proxy.lt = () => chain(resolver)
    proxy.select = () => chain(resolver)
    proxy.maybeSingle = () => Promise.resolve(undefined).then(resolver)
    proxy.single = () => Promise.resolve(undefined).then(resolver)
    ;(proxy as unknown as PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>).then = (res, rej) =>
      resolver().then(res, rej)
    return proxy as Record<string, unknown> & PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>
  }

  const supabase = {
    from: (table: string) => {
      if (table !== 'idempotency_records') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => {
          ops.push({ kind: 'select' })
          // After a 23505, expose the winner row; before, behave as the
          // initial row dictated.
          const visible = insertConflicted && conflictWinner !== undefined ? conflictWinner : row
          return chain(async () => ({ data: visible, error: null }))
        },
        insert: (patch: Record<string, unknown>) => {
          ops.push({ kind: 'insert', patch })
          if (nextInsertConflict) {
            nextInsertConflict = false
            insertConflicted = true
            return chain(async () => ({ data: null, error: { message: 'duplicate key', code: '23505' } }))
          }
          if (nextInsertGenericError) {
            nextInsertGenericError = false
            return chain(async () => ({ data: null, error: { message: 'connection lost', code: 'XX000' } }))
          }
          row = { ...(patch as unknown as FakeRecord) }
          return chain(async () => ({ data: row, error: null }))
        },
        update: (patch: Record<string, unknown>) => {
          ops.push({ kind: 'update', patch })
          if (row) row = { ...row, ...(patch as Partial<FakeRecord>) }
          return chain(async () => ({ data: row, error: null }))
        },
        delete: () => {
          ops.push({ kind: 'delete' })
          row = null
          return chain(async () => ({ data: null, error: null }))
        },
      }
    },
  }

  return { supabase, ops, getRow: () => row }
}

const API_KEY_ID = 'k1'
const KEY = '11111111-1111-1111-1111-111111111111'
const METHOD = 'POST'
const PATH = '/api/v1/leads'
const BODY = '{"projectId":"p1","email":"a@b.com"}'

function makeHandler(response: () => Response): { handler: () => Promise<Response>; calls: () => number } {
  const calls = vi.fn(async () => response())
  return { handler: calls, calls: () => calls.mock.calls.length }
}

beforeEach(() => {
  vi.useRealTimers()
})

// ── Hash helper ────────────────────────────────────────────────────────

describe('hashRequest', () => {
  it('is deterministic', () => {
    expect(hashRequest('POST', '/x', 'body')).toBe(hashRequest('POST', '/x', 'body'))
  })

  it('is sensitive to method', () => {
    expect(hashRequest('POST', '/x', 'b')).not.toBe(hashRequest('PUT', '/x', 'b'))
  })

  it('is sensitive to path (so same key on different endpoints mismatches)', () => {
    expect(hashRequest('POST', '/v1/a', 'b')).not.toBe(hashRequest('POST', '/v1/b', 'b'))
  })

  it('is sensitive to body', () => {
    expect(hashRequest('POST', '/x', '{"a":1}')).not.toBe(hashRequest('POST', '/x', '{"a":2}'))
  })

  it('is case-insensitive on method', () => {
    expect(hashRequest('post', '/x', 'b')).toBe(hashRequest('POST', '/x', 'b'))
  })
})

// ── Bypass when no key ─────────────────────────────────────────────────

describe('withIdempotency — no key', () => {
  it('skips the cache entirely when Idempotency-Key is null', async () => {
    const { supabase, ops } = makeFakeSupabase()
    const { handler, calls } = makeHandler(() => Response.json({ ok: true }))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: null,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    expect(res.status).toBe(200)
    expect(calls()).toBe(1)
    expect(ops).toHaveLength(0) // no DB activity at all
  })
})

// ── Cold cache + happy path ────────────────────────────────────────────

describe('withIdempotency — cold cache', () => {
  it('claims processing row, runs handler, caches response', async () => {
    const { supabase, ops, getRow } = makeFakeSupabase(null)
    const { handler, calls } = makeHandler(() => Response.json({ id: 'lead-1' }, { status: 201 }))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'lead-1' })
    expect(calls()).toBe(1)
    // Sequence: select → insert(processing) → update(completed)
    expect(ops.map((o) => o.kind)).toEqual(['select', 'insert', 'update'])
    expect(getRow()?.status).toBe('completed')
    expect(getRow()?.response_status).toBe(201)
    expect(getRow()?.response_body).toBe('{"id":"lead-1"}')
  })

  it('does NOT cache responses larger than RESPONSE_BODY_CAP', async () => {
    const huge = 'x'.repeat(RESPONSE_BODY_CAP + 1)
    const { supabase, ops, getRow } = makeFakeSupabase(null)
    const { handler } = makeHandler(() => new Response(huge, { status: 200 }))

    await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    // Sequence ends in delete (claim was rolled back) — no completed row.
    expect(ops.map((o) => o.kind)).toEqual(['select', 'insert', 'delete'])
    expect(getRow()).toBeNull()
  })
})

// ── Replay path ────────────────────────────────────────────────────────

describe('withIdempotency — cache hit (completed)', () => {
  it('returns cached response with the replay header', async () => {
    const cachedBody = '{"id":"lead-1"}'
    const requestHash = hashRequest(METHOD, PATH, BODY)
    const { supabase } = makeFakeSupabase({
      api_key_id: API_KEY_ID,
      key: KEY,
      request_hash: requestHash,
      status: 'completed',
      response_status: 201,
      response_body: cachedBody,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    const { handler, calls } = makeHandler(() => Response.json({ id: 'should-not-fire' }))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    expect(calls()).toBe(0) // handler never re-ran
    expect(res.status).toBe(201)
    expect(await res.text()).toBe(cachedBody)
    expect(res.headers.get(REPLAY_HEADER)).toBe('true')
  })

  it('returns 422 when key is reused with a different body', async () => {
    const { supabase } = makeFakeSupabase({
      api_key_id: API_KEY_ID,
      key: KEY,
      request_hash: hashRequest(METHOD, PATH, BODY),
      status: 'completed',
      response_status: 200,
      response_body: '{}',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    const { handler, calls } = makeHandler(() => Response.json({}))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY + 'X', // different body!
      handler,
    })

    expect(calls()).toBe(0)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('different request body')
  })

  it('returns 422 when same key is sent to a different endpoint', async () => {
    const { supabase } = makeFakeSupabase({
      api_key_id: API_KEY_ID,
      key: KEY,
      request_hash: hashRequest(METHOD, '/api/v1/leads', BODY),
      status: 'completed',
      response_status: 200,
      response_body: '{}',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    const { handler, calls } = makeHandler(() => Response.json({}))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: '/api/v1/webhooks', // different endpoint
      bodyText: BODY,
      handler,
    })

    expect(calls()).toBe(0)
    expect(res.status).toBe(422)
  })
})

// ── In-flight protection ───────────────────────────────────────────────

describe('withIdempotency — in flight', () => {
  it('returns 409 when a recent processing row exists for the same hash', async () => {
    const { supabase } = makeFakeSupabase({
      api_key_id: API_KEY_ID,
      key: KEY,
      request_hash: hashRequest(METHOD, PATH, BODY),
      status: 'processing',
      response_status: null,
      response_body: null,
      created_at: new Date().toISOString(), // just now
      completed_at: null,
    })
    const { handler, calls } = makeHandler(() => Response.json({}))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    expect(calls()).toBe(0)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('already in flight')
    expect(body.retry_after_seconds).toBeGreaterThan(0)
  })

  it('falls through and re-executes when the processing row is stale', async () => {
    const ancient = new Date(Date.now() - PROCESSING_STALE_MS - 5000).toISOString()
    const { supabase, getRow } = makeFakeSupabase({
      api_key_id: API_KEY_ID,
      key: KEY,
      request_hash: hashRequest(METHOD, PATH, BODY),
      status: 'processing',
      response_status: null,
      response_body: null,
      created_at: ancient,
      completed_at: null,
    })
    const { handler, calls } = makeHandler(() => Response.json({ id: 'fresh' }, { status: 201 }))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    expect(calls()).toBe(1)
    expect(res.status).toBe(201)
    expect(getRow()?.status).toBe('completed')
  })
})

// ── Failure cleanup ────────────────────────────────────────────────────

describe('withIdempotency — handler failure', () => {
  it('drops the processing claim when the handler throws so retries are unblocked', async () => {
    const { supabase, ops, getRow } = makeFakeSupabase(null)
    const handler = vi.fn(async () => {
      throw new Error('downstream blew up')
    })

    await expect(
      withIdempotency({
        supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
        apiKeyId: API_KEY_ID,
        idempotencyKey: KEY,
        method: METHOD,
        path: PATH,
        bodyText: BODY,
        handler,
      }),
    ).rejects.toThrow('downstream blew up')

    // Sequence: select → insert (claim) → delete (rollback). No completed row.
    expect(ops.map((o) => o.kind)).toEqual(['select', 'insert', 'delete'])
    expect(getRow()).toBeNull()
  })
})

// ── Race-lost path (the critical one we'd ship without) ────────────────

describe('withIdempotency — concurrent retry race', () => {
  it('replays winner response when our INSERT loses to 23505', async () => {
    const winnerHash = hashRequest(METHOD, PATH, BODY)
    // Initial select → null (no row visible at the start of OUR request).
    // After our INSERT 23505s, the re-select returns the winner's row.
    const { supabase, ops } = makeFakeSupabase(null, {
      insertConflict: true,
      conflictWinner: {
        api_key_id: API_KEY_ID,
        key: KEY,
        request_hash: winnerHash,
        status: 'completed',
        response_status: 201,
        response_body: '{"id":"winner-lead"}',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
    })
    const { handler, calls } = makeHandler(() => Response.json({ id: 'we-should-not-fire' }))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    expect(calls()).toBe(0)
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('{"id":"winner-lead"}')
    expect(res.headers.get(REPLAY_HEADER)).toBe('true')
    // Sequence: select → insert(conflict) → select(winner)
    expect(ops.map((o) => o.kind)).toEqual(['select', 'insert', 'select'])
  })

  it('returns 409 when our INSERT loses but the winner is still processing', async () => {
    const winnerHash = hashRequest(METHOD, PATH, BODY)
    const { supabase } = makeFakeSupabase(null, {
      insertConflict: true,
      conflictWinner: {
        api_key_id: API_KEY_ID,
        key: KEY,
        request_hash: winnerHash,
        status: 'processing',
        response_status: null,
        response_body: null,
        created_at: new Date().toISOString(), // recent
        completed_at: null,
      },
    })
    const { handler, calls } = makeHandler(() => Response.json({}))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    expect(calls()).toBe(0)
    expect(res.status).toBe(409)
  })

  it('degrades to a non-idempotent execution on a non-conflict DB error', async () => {
    const { supabase } = makeFakeSupabase(null, { insertGenericError: true })
    const { handler, calls } = makeHandler(() => Response.json({ ok: true }))

    const res = await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    // Better to serve the request non-idempotently than to 500 on a cache
    // plumbing problem.
    expect(res.status).toBe(200)
    expect(calls()).toBe(1)
  })
})


// ── TTL gate ───────────────────────────────────────────────────────────

describe('withIdempotency — TTL', () => {
  it('treats records older than TTL_HOURS as absent (cold cache path)', async () => {
    // We simulate "older than TTL" by returning null from select — that's
    // exactly what the .gt('created_at', cutoff) filter does in production.
    const { supabase, ops } = makeFakeSupabase(null)
    const { handler, calls } = makeHandler(() => Response.json({ ok: true }))

    await withIdempotency({
      supabase: supabase as unknown as Parameters<typeof withIdempotency>[0]['supabase'],
      apiKeyId: API_KEY_ID,
      idempotencyKey: KEY,
      method: METHOD,
      path: PATH,
      bodyText: BODY,
      handler,
    })

    expect(calls()).toBe(1)
    expect(ops[0]!.kind).toBe('select') // still hits DB to look
    expect(TTL_HOURS).toBeGreaterThan(0) // sanity: TTL is real
  })
})
