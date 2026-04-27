// Outbound webhook delivery cron. Drains pending + retry-due rows, signs
// each with the endpoint's secret, posts to the URL, stamps the result.
// Runs every 1 min via vercel.json — short cadence so the first attempt
// after enqueue lands fast (single-digit seconds in steady state).
//
// Auth via CRON_SECRET, matches the other tick endpoints.

export const runtime = 'nodejs'
export const maxDuration = 300

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import {
  deliverWebhook,
  recoverStuckDeliveries,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
} from '@/lib/webhooks/dispatch'

const BATCH_LIMIT = 25

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const tickAt = new Date().toISOString()

  const recovered = await recoverStuckDeliveries(supabase)

  const { data: due } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', tickAt)
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_LIMIT) as { data: WebhookDeliveryRow[] | null }

  if (!due || due.length === 0) {
    return Response.json({
      tick_at: tickAt,
      due: 0,
      success: 0,
      failed: 0,
      pending: 0,
      exhausted: 0,
      recovered,
    })
  }

  // Batch-load endpoints for these deliveries — single round-trip rather
  // than one fetch per delivery.
  const endpointIds = Array.from(new Set(due.map((d) => d.endpoint_id)))
  const { data: endpointRows } = await supabase
    .from('webhook_endpoints')
    .select('id, user_id, project_id, url, secret, events, active, consecutive_failures')
    .in('id', endpointIds) as { data: WebhookEndpointRow[] | null }

  const endpointById = new Map<string, WebhookEndpointRow>()
  for (const e of endpointRows ?? []) endpointById.set(e.id, e)

  let success = 0
  let failed = 0
  let pending = 0
  let exhausted = 0
  let skipped = 0

  for (const delivery of due) {
    const endpoint = endpointById.get(delivery.endpoint_id)
    if (!endpoint) {
      // Endpoint was deleted between enqueue and dispatch. Mark exhausted so
      // it stops being picked.
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'exhausted',
          error: 'Endpoint no longer exists',
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id)
      exhausted += 1
      continue
    }
    if (!endpoint.active) {
      // Skip rows whose endpoint has been disabled (manually or via auto-
      // disable). Leave status='pending' so it resumes if the user re-
      // enables; the next_attempt_at deferral keeps the cron from spinning.
      await supabase
        .from('webhook_deliveries')
        .update({
          next_attempt_at: new Date(Date.now() + 60 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id)
      skipped += 1
      continue
    }

    const outcome = await deliverWebhook(supabase, delivery, endpoint)
    if (outcome.finalStatus === 'success') success += 1
    else if (outcome.finalStatus === 'failed') failed += 1
    else if (outcome.finalStatus === 'pending') pending += 1
    else if (outcome.finalStatus === 'exhausted') exhausted += 1
    else skipped += 1
  }

  return Response.json({
    tick_at: tickAt,
    due: due.length,
    success,
    failed,
    pending,
    exhausted,
    skipped,
    recovered,
  })
}

export const GET = wrapHandler(handleRequest, 'webhooks/dispatch-tick')
export const POST = wrapHandler(handleRequest, 'webhooks/dispatch-tick')
