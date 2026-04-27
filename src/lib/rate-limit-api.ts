// Per-API-key rate limit enforcement. The actual token-bucket math runs in
// Postgres (see supabase/migrations/024_rate_limits.sql) so concurrent
// requests from the same key can't double-spend. This module is the thin
// TypeScript adapter — call `enforceRateLimit` after `authenticateApiKey`
// and either bail with the 429 response or attach the headers to your 2xx.
//
// Defaults: burst 60 tokens, refill 1 tok/sec → sustained 60 req/min, with
// a one-shot allowance up to 60 in a burst. Override via env vars
// API_RATE_LIMIT_BURST / API_RATE_LIMIT_RATE without redeploying.
//
// Fail-open: if the RPC errors, we ALLOW the request and log loudly. Rate-
// limit infra problems should never block customer traffic. The cost of
// briefly serving over the limit is small; the cost of 500ing every v1
// request when the rate-limit DB hiccups is large.

import type { SupabaseClient } from '@supabase/supabase-js'

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const DEFAULT_BURST = envFloat('API_RATE_LIMIT_BURST', 60)
export const DEFAULT_RATE = envFloat('API_RATE_LIMIT_RATE', 1)

export interface RateLimitOk {
  ok: true
  remaining: number
  limit: number
  /** Headers to attach to your 2xx response (Stripe-style). */
  headers: Record<string, string>
}

export interface RateLimitDenied {
  ok: false
  /** Pre-built 429 response with all rate-limit headers + Retry-After. */
  response: Response
}

export type RateLimitOutcome = RateLimitOk | RateLimitDenied

export interface RateLimitOptions {
  /** Max tokens in the bucket (max burst). */
  burst?: number
  /** Refill rate in tokens per second. */
  rate?: number
}

/**
 * Atomically consume one token from the API key's bucket. Returns
 * `{ ok: true, remaining, headers }` for allowed requests, or
 * `{ ok: false, response }` with a pre-built 429 if denied.
 *
 * The success path's headers should be merged into your handler response
 * so clients can self-throttle. Easiest pattern:
 *   const rl = await enforceRateLimit(supabase, auth.keyId)
 *   if (!rl.ok) return rl.response
 *   const res = Response.json(...)
 *   for (const [k, v] of Object.entries(rl.headers)) res.headers.set(k, v)
 *   return res
 */
export async function enforceRateLimit(
  supabase: SupabaseClient,
  apiKeyId: string,
  options: RateLimitOptions = {},
): Promise<RateLimitOutcome> {
  const burst = options.burst ?? DEFAULT_BURST
  const rate = options.rate ?? DEFAULT_RATE

  const { data, error } = await supabase.rpc('consume_rate_token', {
    p_api_key_id: apiKeyId,
    p_burst: burst,
    p_rate: rate,
  }) as { data: number | null; error: { message: string } | null }

  if (error) {
    console.error('[rate-limit] RPC failed; failing open:', error.message)
    return { ok: true, remaining: -1, limit: burst, headers: {} }
  }

  // RPC returns null when the WHERE clause didn't match → rate limited.
  if (data == null) {
    // Reset is "when the next token is available" — at rate=1/sec, that's
    // 1 second from now. We round up to satisfy the Retry-After contract
    // (clients should wait AT LEAST this long before retrying).
    const retryAfterSec = Math.max(1, Math.ceil(1 / rate))
    const resetAt = Math.ceil(Date.now() / 1000) + retryAfterSec
    return {
      ok: false,
      response: Response.json(
        {
          error: 'Rate limit exceeded',
          retry_after_seconds: retryAfterSec,
          limit: burst,
        },
        {
          status: 429,
          headers: {
            'x-ratelimit-limit': String(Math.floor(burst)),
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(resetAt),
            'retry-after': String(retryAfterSec),
          },
        },
      ),
    }
  }

  const remaining = Math.max(0, Math.floor(data))
  // The bucket fully refills in `(burst - remaining) / rate` seconds.
  const fillUpInSec = Math.max(1, Math.ceil((burst - remaining) / rate))
  const resetAt = Math.ceil(Date.now() / 1000) + fillUpInSec

  return {
    ok: true,
    remaining,
    limit: Math.floor(burst),
    headers: {
      'x-ratelimit-limit': String(Math.floor(burst)),
      'x-ratelimit-remaining': String(remaining),
      'x-ratelimit-reset': String(resetAt),
    },
  }
}

/**
 * Helper: attach the rate-limit headers from a successful outcome onto a
 * Response that's already constructed. Mutates and returns the Response.
 */
export function attachRateLimitHeaders(response: Response, outcome: RateLimitOutcome): Response {
  if (!outcome.ok) return response
  for (const [k, v] of Object.entries(outcome.headers)) {
    response.headers.set(k, v)
  }
  return response
}
