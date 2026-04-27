// Public API: integration health check.
//
//   GET /api/v1/health
//   Authorization: Bearer gos_live_xxx  (any scope)
//
// Returns the authenticated key's metadata + verifies it can read from
// the database. Customers hit this from their integration setup script
// to confirm:
//   1. Their key is valid (200 vs 401)
//   2. Their key has the scopes they expect (returned as `scopes`)
//   3. Rate limits are working (response headers carry x-ratelimit-*)
//   4. Their server clock is roughly in sync (compared to `server_time`)
//
// No-op on the data side — never mutates anything, never enqueues a
// job, never costs more than a single rate-limit token. Safe to poll
// from CI / health checks.
//
// Auth uses `authenticateApiKey(request, null)` — the health endpoint
// is the one place where any-valid-key passes, since the customer is
// using it to learn what scopes their key has.

export const runtime = 'nodejs'

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { authenticateApiKey } from '@/lib/api-auth'
import { enforceRateLimit, attachRateLimitHeaders } from '@/lib/rate-limit-api'

async function handleGet(request: Request) {
  const auth = await authenticateApiKey(request, null)
  if (!auth.ok) return auth.response

  const supabase = createServiceClient()
  const rl = await enforceRateLimit(supabase, auth.keyId)
  if (!rl.ok) return rl.response

  // Pull the row again for richer metadata (name, prefix, last_used_at).
  // authenticateApiKey only exposes id/userId/scopes; we want the full
  // public view here so customers can see exactly which key they're
  // using without leaking the hash.
  const { data: key } = await supabase
    .from('api_keys')
    .select('id, name, prefix, scopes, last_used_at, expires_at, created_at')
    .eq('id', auth.keyId)
    .maybeSingle() as {
      data: {
        id: string
        name: string
        prefix: string
        scopes: string[]
        last_used_at: string | null
        expires_at: string | null
        created_at: string
      } | null
    }

  return attachRateLimitHeaders(
    Response.json({
      ok: true,
      server_time: new Date().toISOString(),
      key: key ?? {
        id: auth.keyId,
        scopes: auth.scopes,
      },
      rate_limit: {
        limit: rl.limit,
        remaining: rl.remaining,
      },
    }),
    rl,
  )
}

export const GET = wrapHandler(handleGet, 'v1/health')
