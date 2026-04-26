// Ingest job drain. Vercel Cron fires every 2 minutes (vercel.json).
// Auth via CRON_SECRET, same pattern as the social/email tick endpoints.

export const runtime = 'nodejs'
export const maxDuration = 300

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { runIngestJob } from '@/lib/jobs/ingest-queue'
import type { IngestJob } from '@/lib/jobs/ingest-queue'

const BATCH_LIMIT = 5

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const tickAt = new Date().toISOString()

  const { data: due } = await supabase
    .from('ingest_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT) as { data: IngestJob[] | null }

  if (!due || due.length === 0) {
    return Response.json({ tick_at: tickAt, due: 0, completed: 0, failed: 0, requeued: 0 })
  }

  let completed = 0
  let failed = 0
  let requeued = 0
  let skipped = 0

  for (const job of due) {
    const outcome = await runIngestJob(supabase, job)
    if (outcome.finalStatus === 'completed') completed += 1
    else if (outcome.finalStatus === 'failed') failed += 1
    else if (outcome.finalStatus === 'queued') requeued += 1
    else skipped += 1
  }

  return Response.json({ tick_at: tickAt, due: due.length, completed, failed, requeued, skipped })
}

export const GET = wrapHandler(handleRequest, 'jobs/ingest-tick')
export const POST = wrapHandler(handleRequest, 'jobs/ingest-tick')
