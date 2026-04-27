// Idempotency-Key middleware. Wraps a route handler so retried requests
// with the same Idempotency-Key return the cached response instead of
// re-running the side effect.
//
// Design (mirrors Stripe's well-tested model, simplified for our scale):
//
// - **Opt-in**: caller sends `Idempotency-Key: <uuid>`. Without the
//   header we just call the handler — backwards-compatible.
// - **Scope**: `(api_key_id, key)`. Different customers can collide on
//   the literal key string without affecting each other.
// - **Body hash**: the request hash includes method + path + raw body.
//   Reusing a key with a different request body returns 422 so client
//   bugs are loud.
// - **Cache shape**: status + body (text). On replay we rebuild the
//   Response and add `Idempotent-Replayed: true` so the client knows.
// - **Race-safe claim**: we INSERT (not upsert) and detect conflicts via
//   SQLSTATE 23505. ONE writer wins per (api_key_id, key); concurrent
//   retries observe the winner and respond accordingly. This is the
//   critical guarantee — without it two parallel retries could both
//   double-enqueue an ingest job or double-create a webhook.
// - **Stale claim recovery**: a `processing` row older than
//   PROCESSING_STALE_MS is presumed dead (handler crashed mid-run). We
//   delete it, then re-claim. The unique constraint still keeps two
//   recovers from racing.
// - **TTL**: lookups filter by `created_at > now() - 24h`. Old rows are
//   ignored without needing a cron sweep.
// - **Body cap**: responses larger than RESPONSE_BODY_CAP bypass the
//   cache (we still process the request — just don't cache).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const TTL_HOURS = 24
export const PROCESSING_STALE_MS = 60_000
export const RESPONSE_BODY_CAP = 100 * 1024 // 100KB
export const REPLAY_HEADER = 'idempotent-replayed'

/**
 * Compute the deterministic hash for a request. Includes method + path so
 * the same key on different endpoints is reported as a mismatch (loud
 * client error rather than silent collision).
 */
export function hashRequest(method: string, path: string, body: string): string {
  return createHash('sha256').update(`${method.toUpperCase()} ${path}\n${body}`).digest('hex')
}

interface ExistingRecord {
  request_hash: string
  status: 'processing' | 'completed'
  response_status: number | null
  response_body: string | null
  created_at: string
}

export interface WithIdempotencyArgs {
  supabase: SupabaseClient
  apiKeyId: string
  /** Value of the Idempotency-Key header, or null if not provided. */
  idempotencyKey: string | null
  /** HTTP method (GET, POST, ...). Used in the request hash. */
  method: string
  /** URL pathname. Used in the request hash. */
  path: string
  /** Raw request body as a string. Use empty string for body-less requests. */
  bodyText: string
  /** The actual route handler — only invoked on a cache miss. */
  handler: () => Promise<Response>
}

/**
 * Run `handler` with idempotent-replay semantics. See module header for
 * the full design. If `idempotencyKey` is null, we just delegate to the
 * handler — idempotency is purely opt-in.
 */
export async function withIdempotency(args: WithIdempotencyArgs): Promise<Response> {
  if (!args.idempotencyKey) return args.handler()

  const key = args.idempotencyKey.slice(0, 255)
  const requestHash = hashRequest(args.method, args.path, args.bodyText)
  const ttlCutoff = new Date(Date.now() - TTL_HOURS * 60 * 60_000).toISOString()

  // ── Look up existing record ───────────────────────────────────────
  const existing = await fetchRecord(args.supabase, args.apiKeyId, key, ttlCutoff)

  if (existing) {
    const decision = decideFromExisting(existing, requestHash)
    if (decision.kind === 'replay') return replayCached(existing)
    if (decision.kind === 'mismatch') return mismatchResponse()
    if (decision.kind === 'in-flight') return inFlightResponse(decision.retryAfterMs)
    // decision.kind === 'stale-purge' → delete the stale row, fall through to claim.
    await args.supabase
      .from('idempotency_records')
      .delete()
      .eq('api_key_id', args.apiKeyId)
      .eq('key', key)
      .eq('status', 'processing')
  }

  // ── Try to claim. INSERT (not upsert) so the unique constraint kills
  //    parallel claims atomically — only one writer wins. ───────────
  const claimedAt = new Date().toISOString()
  const { error: insertErr } = await args.supabase
    .from('idempotency_records')
    .insert({
      api_key_id: args.apiKeyId,
      key,
      request_hash: requestHash,
      status: 'processing',
      response_status: null,
      response_body: null,
      created_at: claimedAt,
      completed_at: null,
    })

  if (insertErr) {
    // SQLSTATE 23505 = unique_violation → another writer beat us. Re-fetch
    // their row and respond accordingly.
    if (insertErr.code === '23505') {
      const winner = await fetchRecord(args.supabase, args.apiKeyId, key, ttlCutoff)
      if (winner) {
        const decision = decideFromExisting(winner, requestHash)
        if (decision.kind === 'replay') return replayCached(winner)
        if (decision.kind === 'mismatch') return mismatchResponse()
        if (decision.kind === 'in-flight') return inFlightResponse(decision.retryAfterMs)
        // Stale again — the system is fighting itself; degrade rather than
        // ping-ponging.
      }
      console.warn('[idempotency] conflict winner row missing; running without cache')
      return args.handler()
    }
    // Other DB error — don't fail the request. Better to be non-idempotent
    // than to 500 on a cache plumbing problem.
    console.error('[idempotency] claim failed:', insertErr.message)
    return args.handler()
  }

  // ── We own the claim. Run handler. ────────────────────────────────
  let response: Response
  try {
    response = await args.handler()
  } catch (err) {
    // Drop the claim on failure so the next retry can re-attempt the
    // operation. Without this, a transient handler error would lock the
    // key for PROCESSING_STALE_MS.
    await args.supabase
      .from('idempotency_records')
      .delete()
      .eq('api_key_id', args.apiKeyId)
      .eq('key', key)
      .eq('status', 'processing')
    throw err
  }

  // ── Cache the response (best-effort) ──────────────────────────────
  const cloned = response.clone()
  const bodyText = await cloned.text()

  if (bodyText.length > RESPONSE_BODY_CAP) {
    // Too big to cache — drop the claim so retries can re-execute. The
    // user's retry will work but won't be idempotent.
    await args.supabase
      .from('idempotency_records')
      .delete()
      .eq('api_key_id', args.apiKeyId)
      .eq('key', key)
    return response
  }

  await args.supabase
    .from('idempotency_records')
    .update({
      status: 'completed',
      response_status: response.status,
      response_body: bodyText,
      completed_at: new Date().toISOString(),
    })
    .eq('api_key_id', args.apiKeyId)
    .eq('key', key)

  return response
}

async function fetchRecord(
  supabase: SupabaseClient,
  apiKeyId: string,
  key: string,
  ttlCutoff: string,
): Promise<ExistingRecord | null> {
  const { data } = await supabase
    .from('idempotency_records')
    .select('request_hash, status, response_status, response_body, created_at')
    .eq('api_key_id', apiKeyId)
    .eq('key', key)
    .gt('created_at', ttlCutoff)
    .maybeSingle() as { data: ExistingRecord | null }
  return data
}

type Decision =
  | { kind: 'replay' }
  | { kind: 'mismatch' }
  | { kind: 'in-flight'; retryAfterMs: number }
  | { kind: 'stale-purge' }

/**
 * Pure decision function — given an existing row + the current request
 * hash, what should we do? Exposed for tests; production goes through
 * withIdempotency.
 */
export function decideFromExisting(existing: ExistingRecord, requestHash: string): Decision {
  if (existing.request_hash !== requestHash) return { kind: 'mismatch' }
  if (existing.status === 'completed') return { kind: 'replay' }
  // status === 'processing'
  const ageMs = Date.now() - new Date(existing.created_at).getTime()
  if (ageMs < PROCESSING_STALE_MS) {
    return { kind: 'in-flight', retryAfterMs: PROCESSING_STALE_MS - ageMs }
  }
  return { kind: 'stale-purge' }
}

function replayCached(record: ExistingRecord): Response {
  const status = record.response_status ?? 200
  const body = record.response_body ?? ''
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json',
      [REPLAY_HEADER]: 'true',
    },
  })
}

function mismatchResponse(): Response {
  return Response.json(
    {
      error: 'Idempotency-Key reused with a different request body',
      hint: 'Generate a fresh key for each distinct operation. Same key MUST mean same body.',
    },
    { status: 422 },
  )
}

function inFlightResponse(retryAfterMs: number): Response {
  return Response.json(
    {
      error: 'A request with this Idempotency-Key is already in flight',
      retry_after_seconds: Math.ceil(retryAfterMs / 1000),
    },
    { status: 409 },
  )
}
