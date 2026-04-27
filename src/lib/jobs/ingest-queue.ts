// Background ingest job queue. The v1 ingest route enqueues; the
// /api/jobs/ingest-tick cron drains. Both ends share this module so the
// state machine lives in one place.
//
// Status flow:
//   queued → running → completed | failed
// Retries: up to MAX_INGEST_ATTEMPTS for transient errors (LLM timeout, 5xx).
// Permanent failures (URL prefix "Failed to fetch site": bot wall, 4xx, dead
// host) stamp `failed` immediately and skip the retry ladder.

import type { SupabaseClient } from '@supabase/supabase-js'
import { runIngest } from '@/lib/ai/intelligence/ingest'
import { checkBudget } from '@/lib/budget-guard'
import { emitEvent } from '@/lib/webhooks/dispatch'

export const MAX_INGEST_ATTEMPTS = 3

// If a job has been in `running` longer than this, the worker that claimed
// it is presumed dead (serverless function timeout, OOM, container reboot).
// The cron's recoverStuckJobs() sweeps these back to queued so they retry
// instead of sitting forever. Set above the LLM-call p99 (~60s) with margin.
export const STUCK_RUNNING_TIMEOUT_MS = 10 * 60 * 1000

export interface IngestJob {
  id: string
  user_id: string
  project_id: string
  url: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  attempts: number
  error: string | null
  result: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export async function enqueueIngest(args: {
  supabase: SupabaseClient
  userId: string
  projectId: string
  url: string
}): Promise<{ id: string }> {
  const { supabase, userId, projectId, url } = args
  const { data, error } = await supabase
    .from('ingest_jobs')
    .insert({ user_id: userId, project_id: projectId, url, status: 'queued' })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }
  if (error || !data) throw new Error(`Failed to enqueue ingest: ${error?.message ?? 'no row returned'}`)
  return { id: data.id }
}

/**
 * Atomically claim a queued job. Conditional UPDATE keyed on (id, status,
 * attempts): if another worker beat us the WHERE clause matches zero rows
 * and we get null back. Mirrors the dispatchPost claim pattern.
 */
async function claimJob(
  supabase: SupabaseClient,
  job: IngestJob,
): Promise<IngestJob | null> {
  const { data } = await supabase
    .from('ingest_jobs')
    .update({
      status: 'running',
      attempts: job.attempts + 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', job.status)
    .eq('attempts', job.attempts)
    .select('*')
    .maybeSingle() as { data: IngestJob | null }
  return data
}

/**
 * Run a single job end-to-end: claim → runIngest → stamp result/error.
 * Returns the final status so the cron can tally outcomes. Never throws —
 * any error is caught and reflected in the row.
 */
export async function runIngestJob(
  supabase: SupabaseClient,
  job: IngestJob,
): Promise<{ id: string; finalStatus: 'completed' | 'failed' | 'skipped' | 'queued' }> {
  const claimed = await claimJob(supabase, job)
  if (!claimed) return { id: job.id, finalStatus: 'skipped' }

  // Budget check is per-job (not per-enqueue) so a long-queued job doesn't
  // burn budget that's already been spent by other modules.
  const budget = await checkBudget(supabase, claimed.project_id)
  if (!budget.ok) {
    await supabase
      .from('ingest_jobs')
      .update({
        status: 'failed',
        error: `Monthly AI budget exceeded (spent $${budget.spent.toFixed(2)} of $${budget.cap})`,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
    return { id: claimed.id, finalStatus: 'failed' }
  }

  try {
    const { brand } = await runIngest({
      supabase,
      userId: claimed.user_id,
      projectId: claimed.project_id,
      url: claimed.url,
    })
    await supabase
      .from('ingest_jobs')
      .update({
        status: 'completed',
        result: { brand },
        error: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)

    // Fire outbound webhook for any subscribed endpoint. emitEvent is
    // no-throw — webhook plumbing problems must not unwind a successful
    // ingest write.
    await emitEvent({
      supabase,
      userId: claimed.user_id,
      projectId: claimed.project_id,
      eventType: 'ingest.completed',
      payload: {
        job_id: claimed.id,
        project_id: claimed.project_id,
        url: claimed.url,
        brand,
      },
    })

    return { id: claimed.id, finalStatus: 'completed' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ingest failed'
    // Permanent: caller-side errors (bad URL, bot wall, no website). The
    // crawler classifies these by prefix in runIngest.
    const permanent = msg.startsWith('Failed to fetch site')
    const exhausted = claimed.attempts >= MAX_INGEST_ATTEMPTS

    if (permanent || exhausted) {
      await supabase
        .from('ingest_jobs')
        .update({
          status: 'failed',
          error: msg,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', claimed.id)

      await emitEvent({
        supabase,
        userId: claimed.user_id,
        projectId: claimed.project_id,
        eventType: 'ingest.failed',
        payload: {
          job_id: claimed.id,
          project_id: claimed.project_id,
          url: claimed.url,
          error: msg,
          attempts: claimed.attempts,
          permanent,
        },
      })

      return { id: claimed.id, finalStatus: 'failed' }
    }

    // Transient: requeue for the next tick. Keep attempts incremented so the
    // ceiling still applies.
    await supabase
      .from('ingest_jobs')
      .update({
        status: 'queued',
        error: msg,
        started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
    return { id: claimed.id, finalStatus: 'queued' }
  }
}

/**
 * Sweep jobs stuck in `running` longer than STUCK_RUNNING_TIMEOUT_MS. The
 * worker that claimed them is dead. Reset to `queued` so the next tick
 * retries; mark `failed` if the attempts ceiling is exhausted. Called at the
 * top of each cron tick.
 *
 * Returns counts so the cron can include them in its tick-summary payload.
 */
export async function recoverStuckJobs(
  supabase: SupabaseClient,
): Promise<{ requeued: number; failed: number }> {
  const cutoff = new Date(Date.now() - STUCK_RUNNING_TIMEOUT_MS).toISOString()
  const { data: stuck } = await supabase
    .from('ingest_jobs')
    .select('id, attempts')
    .eq('status', 'running')
    .lt('started_at', cutoff) as { data: Array<{ id: string; attempts: number }> | null }

  if (!stuck || stuck.length === 0) return { requeued: 0, failed: 0 }

  let requeued = 0
  let failed = 0
  const nowIso = new Date().toISOString()
  const reason = `Worker timed out (job exceeded ${STUCK_RUNNING_TIMEOUT_MS / 60000}-minute running threshold)`

  for (const row of stuck) {
    const exhausted = row.attempts >= MAX_INGEST_ATTEMPTS
    await supabase
      .from('ingest_jobs')
      .update({
        status: exhausted ? 'failed' : 'queued',
        error: reason,
        started_at: null,
        completed_at: exhausted ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', row.id)
      .eq('status', 'running')
    if (exhausted) failed += 1
    else requeued += 1
  }

  return { requeued, failed }
}
