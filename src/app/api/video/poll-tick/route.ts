// Server-side poller for in-flight video renders. The UI polls while the
// gallery / detail panel is open, but if the user closes the tab a render
// stays "rendering" forever even after it's done upstream. This cron drains
// any active renders every 2 min, calls the provider, writes the result.
//
// Also stamps a stuck-job timeout: anything that's been queued/rendering for
// more than STUCK_AFTER_MS gets marked failed so it doesn't sit forever.

export const runtime = 'nodejs'
export const maxDuration = 300

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { pollVideoRender } from '@/lib/video'

const BATCH_LIMIT = 25
const STUCK_AFTER_MS = 30 * 60 * 1000 // 30 min

interface PendingRow {
  id: string
  status: string
  created_at: string
  updated_at: string
}

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: pending } = await supabase
    .from('video_renders')
    .select('id, status, created_at, updated_at')
    .in('status', ['queued', 'rendering'])
    .order('updated_at', { ascending: true })
    .limit(BATCH_LIMIT) as { data: PendingRow[] | null }

  if (!pending || pending.length === 0) {
    return Response.json({ tick_at: new Date().toISOString(), pending: 0 })
  }

  const now = Date.now()
  let polled = 0
  let completed = 0
  let failed = 0
  let timedOut = 0

  for (const row of pending) {
    const ageMs = now - new Date(row.created_at).getTime()
    if (ageMs > STUCK_AFTER_MS) {
      // Stuck — provider never finished, never errored, never returned. Mark
      // failed so the UI shows it as such and doesn't loop forever.
      await supabase
        .from('video_renders')
        .update({
          status: 'failed',
          error: `Render exceeded ${STUCK_AFTER_MS / 60000}-minute timeout`,
        })
        .eq('id', row.id)
      timedOut += 1
      continue
    }

    const result = await pollVideoRender(supabase, row.id)
    polled += 1
    if (result.status === 'completed') completed += 1
    else if (result.status === 'failed') failed += 1
  }

  return Response.json({
    tick_at: new Date().toISOString(),
    pending: pending.length,
    polled,
    completed,
    failed,
    timed_out: timedOut,
  })
}

export const GET = wrapHandler(handleRequest, 'video/poll-tick')
export const POST = wrapHandler(handleRequest, 'video/poll-tick')
