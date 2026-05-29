// Public API: read / delete a single webhook endpoint.
//
//   GET    /api/v1/webhooks/:id  — full record (no secret)
//   DELETE /api/v1/webhooks/:id  — hard delete (cascades deliveries via FK)
//
// Authorization: Bearer gos_live_xxx  (scope: webhooks:write)

export const runtime = 'nodejs'

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { authenticateApiKey } from '@/lib/api-auth'
import { enforceRateLimit, attachRateLimitHeaders } from '@/lib/rate-limit-api'

function endpointIdFromUrl(request: Request): string {
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

async function handleGet(request: Request) {
  const auth = await authenticateApiKey(request, 'webhooks:write')
  if (!auth.ok) return auth.response

  const id = endpointIdFromUrl(request)
  if (!id) return Response.json({ error: 'Missing endpoint id' }, { status: 400 })

  const supabase = createServiceClient()
  const rl = await enforceRateLimit(supabase, auth.keyId)
  if (!rl.ok) return rl.response

  const { data: endpoint } = await supabase
    .from('webhook_endpoints')
    .select('id, user_id, project_id, url, events, active, consecutive_failures, last_delivery_at, last_delivery_status, created_at, updated_at')
    .eq('id', id)
    .maybeSingle() as {
      data: {
        id: string
        user_id: string
        project_id: string | null
        url: string
        events: string[]
        active: boolean
        consecutive_failures: number
        last_delivery_at: string | null
        last_delivery_status: string | null
        created_at: string
        updated_at: string
      } | null
    }

  if (!endpoint || endpoint.user_id !== auth.userId) {
    return Response.json({ error: 'Endpoint not found or not accessible with this key' }, { status: 404 })
  }

  // Strip user_id from the response — the caller already knows.
  const { user_id: _userId, ...publicFields } = endpoint
  void _userId
  return attachRateLimitHeaders(Response.json({ endpoint: publicFields }), rl)
}

async function handleDelete(request: Request) {
  const auth = await authenticateApiKey(request, 'webhooks:write')
  if (!auth.ok) return auth.response

  const id = endpointIdFromUrl(request)
  if (!id) return Response.json({ error: 'Missing endpoint id' }, { status: 400 })

  const supabase = createServiceClient()
  const rl = await enforceRateLimit(supabase, auth.keyId)
  if (!rl.ok) return rl.response

  // Conditional delete by user_id — a key with webhooks:write on user A
  // cannot delete user B's endpoint even if it knew the id.
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: { message: string } | null }

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Endpoint not found or not accessible with this key' }, { status: 404 })
  return attachRateLimitHeaders(Response.json({ ok: true, id: data.id }), rl)
}

export const GET = wrapHandler(handleGet, 'v1/webhooks/:id')
export const DELETE = wrapHandler(handleDelete, 'v1/webhooks/:id')
