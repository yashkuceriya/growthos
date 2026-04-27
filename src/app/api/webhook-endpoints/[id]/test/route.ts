// Send a synthetic ping to verify a receiver. Inserts a delivery row with
// event_type='test.ping', then drives it through deliverWebhook directly so
// the caller gets the HTTP outcome in-band. The test row is recorded in
// webhook_deliveries just like real ones — handy for debugging because it
// shows up in the deliveries panel alongside production traffic.
//
// `test.ping` is intentionally NOT in SUPPORTED_EVENTS — it's not
// subscribable. We bypass emitEvent's subscription filter and dispatch
// directly to this single endpoint.

export const runtime = 'nodejs'
export const maxDuration = 30

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { deliverWebhook, type WebhookDeliveryRow, type WebhookEndpointRow } from '@/lib/webhooks/dispatch'

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  // …/webhook-endpoints/[id]/test → id at parts.length - 2
  const endpointId = parts[parts.length - 2] ?? ''
  if (!endpointId) return Response.json({ error: 'Missing endpoint id' }, { status: 400 })

  // Ownership check via RLS-scoped read on the user's own client.
  const { data: ownEndpoint } = await supabase
    .from('webhook_endpoints')
    .select('id')
    .eq('id', endpointId)
    .maybeSingle() as { data: { id: string } | null }

  if (!ownEndpoint) return Response.json({ error: 'Endpoint not found' }, { status: 404 })

  // Switch to service client so deliverWebhook's claim/update/insert
  // operations don't fight RLS write policies (which we deliberately don't
  // grant on webhook_deliveries to keep the writer surface small).
  const service = createServiceClient()

  const { data: endpoint } = await service
    .from('webhook_endpoints')
    .select('id, user_id, project_id, url, secret, events, active, consecutive_failures')
    .eq('id', endpointId)
    .maybeSingle() as { data: WebhookEndpointRow | null }

  if (!endpoint) return Response.json({ error: 'Endpoint not found' }, { status: 404 })

  const testPayload = {
    note: 'GrowthOS test event — verify your receiver is decoding signatures correctly.',
    endpoint_id: endpoint.id,
    triggered_by: user.id,
    triggered_at: new Date().toISOString(),
  }

  const { data: inserted, error: insertErr } = await service
    .from('webhook_deliveries')
    .insert({
      endpoint_id: endpoint.id,
      event_type: 'test.ping',
      event_payload: testPayload,
      status: 'pending',
    })
    .select('*')
    .single() as { data: WebhookDeliveryRow | null; error: { message: string } | null }

  if (insertErr || !inserted) {
    return Response.json({ error: insertErr?.message ?? 'Failed to enqueue test delivery' }, { status: 500 })
  }

  const outcome = await deliverWebhook(service, inserted, endpoint)

  return Response.json({
    delivery_id: outcome.id,
    final_status: outcome.finalStatus,
  })
}

export const POST = wrapHandler(handlePost, 'webhook-endpoints/:id/test')
