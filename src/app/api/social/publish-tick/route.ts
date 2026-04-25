// Social publish executor. Vercel Cron fires every 5 minutes (vercel.json).
// Drains scheduled posts whose scheduled_at <= now and dispatches each one.
//
// Auth via CRON_SECRET, same pattern as /api/email/sequence-tick.

export const runtime = 'nodejs'
export const maxDuration = 300

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { dispatchPost } from '@/lib/deploy'
import type { SocialPostRow } from '@/lib/deploy/types'

const BATCH_LIMIT = 25

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: due } = await supabase
    .from('social_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(BATCH_LIMIT) as { data: SocialPostRow[] | null }

  if (!due || due.length === 0) {
    return Response.json({ tick_at: now, due: 0, published: 0, failed: 0 })
  }

  let published = 0
  let failed = 0
  const errors: Array<{ post_id: string; error: string }> = []

  for (const post of due) {
    const outcome = await dispatchPost(supabase, post)
    if (outcome.ok) published += 1
    else {
      failed += 1
      if (outcome.error) errors.push({ post_id: post.id, error: outcome.error })
    }
  }

  return Response.json({
    tick_at: now,
    due: due.length,
    published,
    failed,
    errors: errors.slice(0, 10),
  })
}

export const GET = wrapHandler(handleRequest, 'social/publish-tick')
export const POST = wrapHandler(handleRequest, 'social/publish-tick')
