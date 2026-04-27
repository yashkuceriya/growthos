// Session-authed mutation on a single webhook endpoint.
//
//   DELETE /api/webhook-endpoints/:id      — hard delete (cascades deliveries)
//   PATCH  /api/webhook-endpoints/:id      — { active?: boolean, events?: string[] }
//                                            re-enable after auto-disable, or
//                                            update event subscriptions
//
// Secret is intentionally not editable — to rotate, delete + recreate.

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { SUPPORTED_EVENTS, isSupportedEvent } from '@/lib/webhooks/events'

function endpointIdFromUrl(request: Request): string {
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

async function handleDelete(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = endpointIdFromUrl(request)
  if (!id) return Response.json({ error: 'Missing endpoint id' }, { status: 400 })

  const { data, error } = await supabase
    .from('webhook_endpoints')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: { message: string } | null }

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Endpoint not found' }, { status: 404 })
  return Response.json({ ok: true, id: data.id })
}

async function handlePatch(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = endpointIdFromUrl(request)
  if (!id) return Response.json({ error: 'Missing endpoint id' }, { status: 400 })

  const body = await request.json().catch(() => ({})) as {
    active?: boolean
    events?: string[]
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.active === 'boolean') {
    patch.active = body.active
    // Re-enabling clears the failure streak so a borderline-broken receiver
    // gets a fresh window before being auto-disabled again.
    if (body.active) patch.consecutive_failures = 0
  }
  if (Array.isArray(body.events)) {
    const events = body.events.filter((e): e is string => typeof e === 'string' && isSupportedEvent(e))
    if (events.length === 0) {
      return Response.json(
        { error: `events[] required; supported: ${SUPPORTED_EVENTS.join(', ')}` },
        { status: 400 },
      )
    }
    patch.events = events
  }

  if (Object.keys(patch).length === 1) {
    return Response.json({ error: 'No editable fields supplied' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('webhook_endpoints')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, project_id, url, events, active, consecutive_failures, last_delivery_at, last_delivery_status, created_at')
    .maybeSingle() as { data: Record<string, unknown> | null; error: { message: string } | null }

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Endpoint not found' }, { status: 404 })
  return Response.json({ endpoint: data })
}

export const DELETE = wrapHandler(handleDelete, 'webhook-endpoints/:id')
export const PATCH = wrapHandler(handlePatch, 'webhook-endpoints/:id')
