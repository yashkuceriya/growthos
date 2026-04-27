// Public API: list / create webhook endpoints.
//
//   GET  /api/v1/webhooks                         — list user's endpoints
//   POST /api/v1/webhooks { url, events, project_id? }  — create
//
// Authorization: Bearer gos_live_xxx  (scope: webhooks:write)
//
// Secret is generated server-side and returned ONLY on POST. After that
// it's only readable via the dashboard (RLS-gated). The customer copies
// it once into their receiver's env.

export const runtime = 'nodejs'

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { authenticateApiKey } from '@/lib/api-auth'
import { generateWebhookSecret } from '@/lib/webhooks/sign'
import { SUPPORTED_EVENTS, isSupportedEvent } from '@/lib/webhooks/events'
import { withIdempotency } from '@/lib/idempotency'
import { enforceRateLimit, attachRateLimitHeaders } from '@/lib/rate-limit-api'
import { validateWebhookUrl } from '@/lib/webhooks/url-validator'

async function handleGet(request: Request) {
  const auth = await authenticateApiKey(request, 'webhooks:write')
  if (!auth.ok) return auth.response

  const supabase = createServiceClient()
  const rl = await enforceRateLimit(supabase, auth.keyId)
  if (!rl.ok) return rl.response

  const { data } = await supabase
    .from('webhook_endpoints')
    .select('id, project_id, url, events, active, consecutive_failures, last_delivery_at, last_delivery_status, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })

  return attachRateLimitHeaders(Response.json({ endpoints: data ?? [] }), rl)
}

async function handlePost(request: Request) {
  const auth = await authenticateApiKey(request, 'webhooks:write')
  if (!auth.ok) return auth.response

  const supabaseRl = createServiceClient()
  const rl = await enforceRateLimit(supabaseRl, auth.keyId)
  if (!rl.ok) return rl.response

  // Read raw body once for idempotency hashing + handler use.
  const bodyText = await request.text()
  const body = (() => {
    try { return bodyText ? JSON.parse(bodyText) as { url?: string; events?: string[]; project_id?: string | null } : {} }
    catch { return {} }
  })()

  if (!body.url) {
    return Response.json({ error: 'url required' }, { status: 400 })
  }
  const urlCheck = validateWebhookUrl(body.url)
  if (!urlCheck.ok) {
    return Response.json({ error: urlCheck.reason ?? 'Invalid url' }, { status: 400 })
  }
  const events = Array.isArray(body.events)
    ? body.events.filter((e): e is string => typeof e === 'string' && isSupportedEvent(e))
    : []
  if (events.length === 0) {
    return Response.json(
      { error: `events[] required; supported: ${SUPPORTED_EVENTS.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  const out = await withIdempotency({
    supabase,
    apiKeyId: auth.keyId,
    idempotencyKey: request.headers.get('idempotency-key'),
    method: request.method,
    path: new URL(request.url).pathname,
    bodyText,
    handler: async () => {
      // If project_id is provided, confirm the caller's user actually owns it.
      // null = subscribe across all the user's projects.
      let projectId: string | null = null
      if (body.project_id) {
        const { data: p } = await supabase
          .from('projects')
          .select('id, user_id')
          .eq('id', body.project_id)
          .maybeSingle() as { data: { id: string; user_id: string } | null }
        if (!p || p.user_id !== auth.userId) {
          return Response.json({ error: 'project_id not accessible with this key' }, { status: 404 })
        }
        projectId = p.id
      }

      const secret = generateWebhookSecret()

      const { data, error } = await supabase
        .from('webhook_endpoints')
        .insert({
          user_id: auth.userId,
          project_id: projectId,
          url: body.url,
          secret,
          events,
          active: true,
        })
        .select('id, project_id, url, events, active, created_at')
        .single() as { data: { id: string; project_id: string | null; url: string; events: string[]; active: boolean; created_at: string } | null; error: { message: string } | null }

      if (error || !data) {
        return Response.json({ error: error?.message ?? 'Failed to create endpoint' }, { status: 500 })
      }

      // Plaintext secret is returned exactly once — same shape as the
      // api_keys mint flow. Idempotent replay returns the same secret
      // because the cached body contains it; that's intentional, since
      // the customer's retry should be able to recover from a network
      // blip without re-rolling and losing the secret.
      return Response.json(
        {
          endpoint: data,
          secret,
          signature_format: 't=<unix-seconds>,v1=<hex-hmac-sha256>',
          note: 'Save the secret now — it cannot be retrieved later via this endpoint.',
        },
        { status: 201 },
      )
    },
  })

  return attachRateLimitHeaders(out, rl)
}

export const GET = wrapHandler(handleGet, 'v1/webhooks')
export const POST = wrapHandler(handlePost, 'v1/webhooks')
