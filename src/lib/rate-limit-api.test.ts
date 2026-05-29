// Rate-limit adapter tests. The bucket math runs in Postgres so we mock
// the RPC; the adapter's job is to translate `data | null | error` into
// (allowed, remaining, headers) | (denied, 429 response) | fail-open.

import { describe, it, expect } from 'vitest'
import { enforceRateLimit, attachRateLimitHeaders, DEFAULT_BURST } from './rate-limit-api'

function makeSupabase(opts: {
  rpcReturns?: number | null
  rpcError?: { message: string }
}) {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      void fn
      void args
      return {
        data: opts.rpcReturns ?? null,
        error: opts.rpcError ?? null,
      }
    },
  }
}

describe('enforceRateLimit — happy paths', () => {
  it('allows a request and returns remaining + headers', async () => {
    const supabase = makeSupabase({ rpcReturns: 42.7 })
    const result = await enforceRateLimit(
      supabase as unknown as Parameters<typeof enforceRateLimit>[0],
      'k1',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.remaining).toBe(42) // floored
    expect(result.limit).toBe(DEFAULT_BURST)
    expect(result.headers['x-ratelimit-limit']).toBe(String(DEFAULT_BURST))
    expect(result.headers['x-ratelimit-remaining']).toBe('42')
    expect(result.headers['x-ratelimit-reset']).toMatch(/^\d+$/)
  })

  it('allows on the last available token (remaining=0)', async () => {
    const supabase = makeSupabase({ rpcReturns: 0 })
    const result = await enforceRateLimit(
      supabase as unknown as Parameters<typeof enforceRateLimit>[0],
      'k1',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.remaining).toBe(0)
  })
})

describe('enforceRateLimit — denied', () => {
  it('returns 429 with all rate-limit headers when RPC returns null', async () => {
    const supabase = makeSupabase({ rpcReturns: null })
    const result = await enforceRateLimit(
      supabase as unknown as Parameters<typeof enforceRateLimit>[0],
      'k1',
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(429)
    const body = await result.response.json()
    expect(body.error).toBe('Rate limit exceeded')
    expect(body.retry_after_seconds).toBeGreaterThanOrEqual(1)
    expect(result.response.headers.get('retry-after')).toBe(String(body.retry_after_seconds))
    expect(result.response.headers.get('x-ratelimit-remaining')).toBe('0')
    expect(result.response.headers.get('x-ratelimit-limit')).toBe(String(DEFAULT_BURST))
    expect(result.response.headers.get('x-ratelimit-reset')).toMatch(/^\d+$/)
  })

  it('respects custom rate when computing retry-after', async () => {
    const supabase = makeSupabase({ rpcReturns: null })
    const result = await enforceRateLimit(
      supabase as unknown as Parameters<typeof enforceRateLimit>[0],
      'k1',
      { rate: 0.1 }, // 1 token per 10 seconds
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    const body = await result.response.json()
    expect(body.retry_after_seconds).toBe(10)
  })
})

describe('enforceRateLimit — fail-open', () => {
  it('allows the request when the RPC itself errors (must not block traffic on cache infra issues)', async () => {
    const supabase = makeSupabase({ rpcError: { message: 'connection lost' } })
    const result = await enforceRateLimit(
      supabase as unknown as Parameters<typeof enforceRateLimit>[0],
      'k1',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.remaining).toBe(-1) // sentinel: rate limit didn't run
    expect(result.headers).toEqual({}) // no headers when fail-open
  })
})

describe('attachRateLimitHeaders', () => {
  it('mutates a Response with the outcome headers', async () => {
    const supabase = makeSupabase({ rpcReturns: 30 })
    const outcome = await enforceRateLimit(
      supabase as unknown as Parameters<typeof enforceRateLimit>[0],
      'k1',
    )
    const res = Response.json({ ok: true })
    attachRateLimitHeaders(res, outcome)
    expect(res.headers.get('x-ratelimit-limit')).toBe(String(DEFAULT_BURST))
    expect(res.headers.get('x-ratelimit-remaining')).toBe('30')
  })

  it('is a no-op for denied outcomes (the 429 already has its headers)', async () => {
    const supabase = makeSupabase({ rpcReturns: null })
    const outcome = await enforceRateLimit(
      supabase as unknown as Parameters<typeof enforceRateLimit>[0],
      'k1',
    )
    const res = Response.json({ ok: true })
    attachRateLimitHeaders(res, outcome)
    expect(res.headers.get('x-ratelimit-limit')).toBeNull()
  })

  it('is a no-op for fail-open outcomes (no headers were emitted)', async () => {
    const supabase = makeSupabase({ rpcError: { message: 'down' } })
    const outcome = await enforceRateLimit(
      supabase as unknown as Parameters<typeof enforceRateLimit>[0],
      'k1',
    )
    const res = Response.json({ ok: true })
    attachRateLimitHeaders(res, outcome)
    expect(res.headers.get('x-ratelimit-limit')).toBeNull()
  })
})
