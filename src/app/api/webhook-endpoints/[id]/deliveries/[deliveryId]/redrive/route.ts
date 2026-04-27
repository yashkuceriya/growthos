// Manually retry a failed/exhausted delivery. Resets the row to a clean
// pending state (status=pending, attempts=0, errors cleared, next_attempt
// set to now) and drives it through deliverWebhook synchronously so the
// caller sees the result in-band.
//
// Retrying a row that's currently `pending` or `delivering` is a no-op —
// the cron has it. Re-driving `success` is rejected (idempotency: don't
// double-deliver a real event the receiver already acked).

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
  // …/webhook-endpoints/[id]/deliveries/[deliveryId]/redrive
  //                              -4   -3   -2          -1
  const deliveryId = parts[parts.length - 2] ?? ''
  const endpointId = parts[parts.length - 4] ?? ''
  if (!endpointId || !deliveryId) {
    return Response.json({ error: 'Missing endpoint or delivery id' }, { status: 400 })
  }

  // Ownership check via RLS on user's client.
  const { data: ownEndpoint } = await supabase
    .from('webhook_endpoints')
    .select('id')
    .eq('id', endpointId)
    .maybeSingle() as { data: { id: string } | null }

  if (!ownEndpoint) return Response.json({ error: 'Endpoint not found' }, { status: 404 })

  const service = createServiceClient()

  const { data: delivery } = await service
    .from('webhook_deliveries')
    .select('*')
    .eq('id', deliveryId)
    .eq('endpoint_id', endpointId)
    .maybeSingle() as { data: WebhookDeliveryRow | null }

  if (!delivery) return Response.json({ error: 'Delivery not found' }, { status: 404 })

  if (delivery.status === 'success') {
    return Response.json({ error: 'Already delivered — not redriving' }, { status: 409 })
  }
  if (delivery.status === 'pending' || delivery.status === 'delivering') {
    return Response.json({ error: 'Already in flight — wait for the cron to drain it' }, { status: 409 })
  }

  // Reset to a fresh pending state. Conditional on (id, status) so an
  // overlapping cron tick can't race past us.
  const nowIso = new Date().toISOString()
  const { data: reset } = await service
    .from('webhook_deliveries')
    .update({
      status: 'pending',
      attempts: 0,
      error: null,
      response_status: null,
      response_body: null,
      next_attempt_at: nowIso,
      delivered_at: null,
      updated_at: nowIso,
    })
    .eq('id', delivery.id)
    .eq('status', delivery.status)
    .select('*')
    .maybeSingle() as { data: WebhookDeliveryRow | null }

  if (!reset) {
    return Response.json({ error: 'Delivery state changed during reset — try again' }, { status: 409 })
  }

  const { data: endpoint } = await service
    .from('webhook_endpoints')
    .select('id, user_id, project_id, url, secret, events, active, consecutive_failures')
    .eq('id', endpointId)
    .maybeSingle() as { data: WebhookEndpointRow | null }

  if (!endpoint) return Response.json({ error: 'Endpoint not found' }, { status: 404 })

  const outcome = await deliverWebhook(service, reset, endpoint)
  return Response.json({
    delivery_id: outcome.id,
    final_status: outcome.finalStatus,
  })
}

export const POST = wrapHandler(handlePost, 'webhook-endpoints/:id/deliveries/:deliveryId/redrive')
