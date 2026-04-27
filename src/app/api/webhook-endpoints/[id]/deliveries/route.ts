// Session-authed delivery history for a single endpoint. RLS on
// webhook_deliveries (defined in migration 022) gates this via the
// endpoint's owning user — we still verify the endpoint id resolves to
// this user's row to short-circuit a 404 before the deliveries query
// returns an empty list with no explanation.

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'

const PAGE_LIMIT = 50

async function handleGet(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  // …/webhook-endpoints/[id]/deliveries → id is at parts.length - 2
  const endpointId = parts[parts.length - 2] ?? ''
  if (!endpointId) return Response.json({ error: 'Missing endpoint id' }, { status: 400 })

  const { data: endpoint } = await supabase
    .from('webhook_endpoints')
    .select('id, user_id')
    .eq('id', endpointId)
    .maybeSingle() as { data: { id: string; user_id: string } | null }

  if (!endpoint || endpoint.user_id !== user.id) {
    return Response.json({ error: 'Endpoint not found' }, { status: 404 })
  }

  const limit = Math.min(Number(url.searchParams.get('limit')) || PAGE_LIMIT, PAGE_LIMIT)

  const { data: deliveries } = await supabase
    .from('webhook_deliveries')
    .select('id, event_type, status, attempts, response_status, response_body, error, next_attempt_at, delivered_at, created_at')
    .eq('endpoint_id', endpointId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return Response.json({ deliveries: deliveries ?? [] })
}

export const GET = wrapHandler(handleGet, 'webhook-endpoints/:id/deliveries')
