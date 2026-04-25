// Engagement sync cron. Fired every 30 min by Vercel Cron (vercel.json).
// Picks up to BATCH_LIMIT published posts that have never been synced or
// were last synced more than RESYNC_INTERVAL_MS ago, and refreshes their
// engagement jsonb. Auth via CRON_SECRET, same as the other ticks.

export const runtime = 'nodejs'
export const maxDuration = 300

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { syncPostEngagement } from '@/lib/deploy/engagement'
import type { SocialPostRow } from '@/lib/deploy/types'

const BATCH_LIMIT = 50
const RESYNC_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - RESYNC_INTERVAL_MS).toISOString()

  // Pull posts ordered nulls-first so brand-new published posts get their
  // first sync ahead of older ones whose stats are merely stale.
  const { data: stale } = await supabase
    .from('social_posts')
    .select('*')
    .eq('status', 'published')
    .not('external_id', 'is', null)
    .or(`engagement_synced_at.is.null,engagement_synced_at.lt.${cutoff}`)
    .order('engagement_synced_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT) as { data: SocialPostRow[] | null }

  if (!stale || stale.length === 0) {
    return Response.json({ tick_at: new Date().toISOString(), candidates: 0, synced: 0, failed: 0 })
  }

  let synced = 0
  let failed = 0
  const errors: Array<{ post_id: string; error: string }> = []

  for (const post of stale) {
    const outcome = await syncPostEngagement(supabase, post)
    if (outcome.ok) synced += 1
    else {
      failed += 1
      if (outcome.error) errors.push({ post_id: post.id, error: outcome.error })
    }
  }

  return Response.json({
    tick_at: new Date().toISOString(),
    candidates: stale.length,
    synced,
    failed,
    errors: errors.slice(0, 10),
  })
}

export const GET = wrapHandler(handleRequest, 'social/engagement-tick')
export const POST = wrapHandler(handleRequest, 'social/engagement-tick')
