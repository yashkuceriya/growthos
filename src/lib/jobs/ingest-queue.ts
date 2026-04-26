// Background ingest job queue. The v1 ingest route enqueues; the
// /api/jobs/ingest-tick cron drains. Both ends share this module so the
// state machine lives in one place.
//
// Status flow:
//   queued → running → completed | failed
// Retries: up to MAX_INGEST_ATTEMPTS for transient errors (bot wall, 5xx).
// Permanent failures (4xx, no website) stamp `failed` immediately.

import type { SupabaseClient } from '@supabase/supabase-js'
import { runIngest } from '@/lib/ai/intelligence/ingest'
import { checkBudget } from '@/lib/budget-guard'

export const MAX_INGEST_ATTEMPTS = 3

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
