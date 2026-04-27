// Outbound webhook dispatcher. Emit fans an event out to every active
// subscribed endpoint; the cron drains pending deliveries with exponential
// backoff. Auto-disables endpoints that fail consecutively too many times so
// a customer's broken receiver doesn't burn cron quota indefinitely.

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSignatureHeader } from './sign'

export const MAX_DELIVERY_ATTEMPTS = 5

// Backoff schedule (minutes) per attempt. Index = attempts already made
// (post-claim). attempts=1 → 1m, =2 → 5m, =3 → 30m, =4 → 2h, =5 → 6h.
// After MAX, the row is marked exhausted and never retried.
const BACKOFF_MINUTES = [1, 5, 30, 120, 360]

// Auto-disable an endpoint after this many consecutive deliveries fail. The
// owner has to flip `active` back on (or fix the receiver and the next
// successful delivery resets the counter).
export const AUTO_DISABLE_THRESHOLD = 20

// Truncate response bodies before storing — receivers may dump large HTML.
const RESPONSE_BODY_MAX = 2000

export interface WebhookEndpointRow {
  id: string
  user_id: string
  project_id: string | null
  url: string
  secret: string
  events: string[]
  active: boolean
  consecutive_failures: number
}

export interface WebhookDeliveryRow {
  id: string
  endpoint_id: string
  event_type: string
  event_payload: Record<string, unknown>
  attempts: number
  status: 'pending' | 'delivering' | 'success' | 'failed' | 'exhausted'
  next_attempt_at: string
}

/**
 * Fan an event out to every active endpoint subscribed to it. Returns the
 * number of delivery rows created. No-throw: failures here are logged so a
 * webhook problem can never prevent the underlying business operation
 * (ingest completion, lead capture) from being reported.
 */
export async function emitEvent(args: {
  supabase: SupabaseClient
  userId: string
  /**
   * Source project for the event. Pass null if the event has no resolvable
   * project (e.g. an email bounce whose template has been deleted) — we'll
   * still fan out to "all projects" subscriptions but skip project-scoped
   * endpoints since they have no business receiving cross-project signal.
   */
  projectId: string | null
  eventType: string
  payload: Record<string, unknown>
}): Promise<{ created: number }> {
  const { supabase, userId, projectId, eventType, payload } = args

  const { data: endpoints } = await supabase
    .from('webhook_endpoints')
    .select('id, events, project_id, active')
    .eq('user_id', userId)
    .eq('active', true)
    .contains('events', [eventType]) as {
      data: Array<{ id: string; events: string[]; project_id: string | null; active: boolean }> | null
    }

  if (!endpoints || endpoints.length === 0) return { created: 0 }

  const matching = endpoints.filter((e) => endpointMatchesProject(e.project_id, projectId))
  if (matching.length === 0) return { created: 0 }

  const rows = matching.map((e) => ({
    endpoint_id: e.id,
    event_type: eventType,
    event_payload: payload,
    status: 'pending' as const,
  }))

  const { error } = await supabase.from('webhook_deliveries').insert(rows)
  if (error) {
    console.error('[webhooks] failed to enqueue deliveries:', error.message)
    return { created: 0 }
  }
  return { created: rows.length }
}

/**
 * Claim a pending delivery. Conditional UPDATE on (id, status, attempts) —
 * loser sees null and bails. Mirrors the publish-tick / ingest-tick claim.
 */
async function claimDelivery(
  supabase: SupabaseClient,
  delivery: WebhookDeliveryRow,
): Promise<WebhookDeliveryRow | null> {
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('webhook_deliveries')
    .update({
      status: 'delivering',
      attempts: delivery.attempts + 1,
      updated_at: nowIso,
    })
    .eq('id', delivery.id)
    .eq('status', delivery.status)
    .eq('attempts', delivery.attempts)
    .select('*')
    .maybeSingle() as { data: WebhookDeliveryRow | null }
  return data
}

function nextAttemptIso(postClaimAttempts: number): string {
  // attempts is 1-indexed post-claim; clamp to last bucket if we somehow
  // overshoot (we shouldn't because we set status=exhausted at MAX).
  const idx = Math.min(postClaimAttempts - 1, BACKOFF_MINUTES.length - 1)
  const mins = BACKOFF_MINUTES[idx] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1]!
  return new Date(Date.now() + mins * 60_000).toISOString()
}

/**
 * Deliver a single claimed row. Caller has already loaded the row + its
 * endpoint. Stamps status, response code, and (on failure) schedules the
 * next attempt. Returns the final state so the cron can tally.
 *
 * Outcome model:
 *   - 2xx → success (terminal). Reset consecutive_failures.
 *   - 4xx (other than 408/429) → failed permanently. Don't retry. Bump fails.
 *   - 5xx, 408, 429, network error → schedule retry, up to MAX_DELIVERY_ATTEMPTS,
 *     after which the row is exhausted (terminal-failure flavor).
 */
export async function deliverWebhook(
  supabase: SupabaseClient,
  delivery: WebhookDeliveryRow,
  endpoint: WebhookEndpointRow,
): Promise<{ id: string; finalStatus: 'success' | 'failed' | 'exhausted' | 'pending' | 'skipped' }> {
  const claimed = await claimDelivery(supabase, delivery)
  if (!claimed) return { id: delivery.id, finalStatus: 'skipped' }

  const body = JSON.stringify({
    id: claimed.id,
    event: claimed.event_type,
    created_at: new Date().toISOString(),
    data: claimed.event_payload,
  })

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = buildSignatureHeader(endpoint.secret, body, timestamp)

  let responseStatus: number | null = null
  let responseBody = ''
  let networkError: string | null = null

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'GrowthOS-Webhooks/1.0',
        'x-growthos-event': claimed.event_type,
        'x-growthos-delivery': claimed.id,
        'x-growthos-signature': signature,
        'x-growthos-timestamp': String(timestamp),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    responseStatus = res.status
    const text = await res.text().catch(() => '')
    responseBody = text.slice(0, RESPONSE_BODY_MAX)
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err)
  }

  const succeeded = responseStatus !== null && responseStatus >= 200 && responseStatus < 300
  const isTransient =
    networkError !== null ||
    responseStatus === null ||
    responseStatus >= 500 ||
    responseStatus === 408 ||
    responseStatus === 429

  const nowIso = new Date().toISOString()

  if (succeeded) {
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'success',
        response_status: responseStatus,
        response_body: responseBody,
        error: null,
        delivered_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', claimed.id)
    await markEndpointDelivery(supabase, endpoint.id, true, endpoint.consecutive_failures)
    return { id: claimed.id, finalStatus: 'success' }
  }

  // Non-success path. Decide between retry and terminal failure.
  const exhausted = claimed.attempts >= MAX_DELIVERY_ATTEMPTS
  const shouldRetry = isTransient && !exhausted

  await supabase
    .from('webhook_deliveries')
    .update({
      status: shouldRetry ? 'pending' : exhausted ? 'exhausted' : 'failed',
      response_status: responseStatus,
      response_body: responseBody,
      error: networkError ?? (responseStatus !== null ? `HTTP ${responseStatus}` : 'unknown'),
      next_attempt_at: shouldRetry ? nextAttemptIso(claimed.attempts) : claimed.next_attempt_at,
      delivered_at: shouldRetry ? null : nowIso,
      updated_at: nowIso,
    })
    .eq('id', claimed.id)

  await markEndpointDelivery(supabase, endpoint.id, false, endpoint.consecutive_failures)

  return {
    id: claimed.id,
    finalStatus: shouldRetry ? 'pending' : exhausted ? 'exhausted' : 'failed',
  }
}

/**
 * Stamp endpoint-level outcome. On success, reset the failure counter and
 * note last_delivery_status='success'. On failure, increment and auto-
 * disable if we hit AUTO_DISABLE_THRESHOLD.
 */
async function markEndpointDelivery(
  supabase: SupabaseClient,
  endpointId: string,
  success: boolean,
  priorConsecutiveFailures: number,
): Promise<void> {
  if (success) {
    await supabase
      .from('webhook_endpoints')
      .update({
        consecutive_failures: 0,
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: 'success',
        updated_at: new Date().toISOString(),
      })
      .eq('id', endpointId)
    return
  }

  const nextFailures = priorConsecutiveFailures + 1
  const patch: Record<string, unknown> = {
    consecutive_failures: nextFailures,
    last_delivery_at: new Date().toISOString(),
    last_delivery_status: 'failed',
    updated_at: new Date().toISOString(),
  }
  if (nextFailures >= AUTO_DISABLE_THRESHOLD) {
    patch.active = false
  }
  await supabase.from('webhook_endpoints').update(patch).eq('id', endpointId)
}

/**
 * Sweep deliveries stuck in `delivering` past the timeout. Identical pattern
 * to recoverStuckJobs() in lib/jobs/ingest-queue.ts.
 */
export const STUCK_DELIVERING_TIMEOUT_MS = 5 * 60 * 1000

export async function recoverStuckDeliveries(
  supabase: SupabaseClient,
): Promise<{ requeued: number; exhausted: number }> {
  const cutoff = new Date(Date.now() - STUCK_DELIVERING_TIMEOUT_MS).toISOString()
  const { data: stuck } = await supabase
    .from('webhook_deliveries')
    .select('id, attempts')
    .eq('status', 'delivering')
    .lt('updated_at', cutoff) as { data: Array<{ id: string; attempts: number }> | null }

  if (!stuck || stuck.length === 0) return { requeued: 0, exhausted: 0 }

  let requeued = 0
  let exhausted = 0
  const nowIso = new Date().toISOString()

  for (const row of stuck) {
    const isExhausted = row.attempts >= MAX_DELIVERY_ATTEMPTS
    await supabase
      .from('webhook_deliveries')
      .update({
        status: isExhausted ? 'exhausted' : 'pending',
        error: 'Worker timed out (delivery exceeded stuck threshold)',
        next_attempt_at: isExhausted ? nowIso : nextAttemptIso(row.attempts),
        delivered_at: isExhausted ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', row.id)
      .eq('status', 'delivering')
    if (isExhausted) exhausted += 1
    else requeued += 1
  }

  return { requeued, exhausted }
}

/**
 * Subscription-matching rule, exposed for unit testing. Three cases:
 *  - endpoint scoped to all projects (project_id null) → matches anything
 *  - endpoint scoped to a project → matches only that project's events
 *  - event with no resolvable project (sourceProjectId null) → fans out
 *    only to all-projects subscriptions, never to scoped ones
 */
export function endpointMatchesProject(
  endpointProjectId: string | null,
  sourceProjectId: string | null,
): boolean {
  if (endpointProjectId == null) return true
  if (sourceProjectId == null) return false
  return endpointProjectId === sourceProjectId
}

// Test-only export (the next-attempt scheduler is the trickiest math).
export const __testing = { nextAttemptIso, BACKOFF_MINUTES }
