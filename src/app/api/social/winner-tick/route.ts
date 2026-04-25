// Winner detection cron. Every 6h via Vercel Cron.
//
// For each project that has any published posts in the rolling window, score
// posts per platform, mark the top N as winners, demote anything that fell out,
// and copy the winning content into style_references so the social generator
// can emulate it on future drafts. Idempotent on re-run via
// style_references.source_post_id unique partial index.
//
// Auth: CRON_SECRET, same pattern as the other ticks.

export const runtime = 'nodejs'
export const maxDuration = 300

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { selectWinners, DEFAULT_WINNER_OPTS } from '@/lib/ai/social/winner'
import type { SocialPostRow } from '@/lib/deploy/types'

interface ProjectRow { id: string; user_id: string }

async function promoteToStyleRef(
  supabase: ReturnType<typeof createServiceClient>,
  post: SocialPostRow,
  score: number,
) {
  // Skip if already promoted (cheap check — partial unique index on
  // source_post_id catches a race, but this avoids the round-trip in the
  // common case).
  const { data: existing } = await supabase
    .from('style_references')
    .select('id')
    .eq('source_post_id', post.id)
    .maybeSingle()
  if (existing) return

  const eng = (post.engagement ?? {}) as { likes?: number; replies?: number; shares?: number; impressions?: number | null }
  const metricProof = JSON.stringify({
    likes: eng.likes ?? 0,
    replies: eng.replies ?? 0,
    shares: eng.shares ?? 0,
    impressions: eng.impressions ?? null,
    score: Number(score.toFixed(3)),
    published_at: post.published_at,
  })

  // Build the rationale from whichever counter pulled this post into the
  // winners. The strategic-agent injection (founder-voice.ts) shows this
  // string as "why it worked: ..." in the prompt, so it has to be useful
  // shorthand, not a full report.
  const reasons: string[] = []
  if ((eng.replies ?? 0) >= 3) reasons.push(`${eng.replies} replies`)
  if ((eng.shares ?? 0) >= 2) reasons.push(`${eng.shares} shares`)
  if ((eng.likes ?? 0) >= 10) reasons.push(`${eng.likes} likes`)
  const whyGood = reasons.length > 0
    ? `Top-performing ${post.platform} post — ${reasons.join(', ')}`
    : `Top-performing ${post.platform} post`

  await supabase.from('style_references').insert({
    user_id: post.user_id,
    project_id: post.project_id,
    asset_kind: `${post.platform}_post`,
    asset_content: post.content,
    why_good: whyGood,
    metric_proof: metricProof,
    source_post_id: post.id,
  })
}

async function processProject(
  supabase: ReturnType<typeof createServiceClient>,
  project: ProjectRow,
): Promise<{ winners: number; demoted: number; promoted: number }> {
  const cutoff = new Date(Date.now() - DEFAULT_WINNER_OPTS.windowDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: posts } = await supabase
    .from('social_posts')
    .select('*')
    .eq('project_id', project.id)
    .eq('status', 'published')
    .gte('published_at', cutoff) as { data: SocialPostRow[] | null }

  if (!posts || posts.length === 0) return { winners: 0, demoted: 0, promoted: 0 }

  const { winners, demote } = selectWinners(posts)

  // Demote first so the winners table-side reflects only the new set.
  for (const d of demote) {
    await supabase
      .from('social_posts')
      .update({ is_winner: false })
      .eq('id', d.id)
  }

  let promoted = 0
  for (const w of winners) {
    await supabase
      .from('social_posts')
      .update({
        is_winner: true,
        winner_score: w.score,
        winner_promoted_at: new Date().toISOString(),
      })
      .eq('id', w.post.id)
    try {
      await promoteToStyleRef(supabase, w.post, w.score)
      promoted += 1
    } catch (err) {
      console.error('[winner-tick][promote]', w.post.id, err)
    }
  }

  return { winners: winners.length, demoted: demote.length, promoted }
}

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, user_id') as { data: ProjectRow[] | null }

  if (!projects || projects.length === 0) {
    return Response.json({ tick_at: new Date().toISOString(), projects: 0 })
  }

  let totalWinners = 0
  let totalDemoted = 0
  let totalPromoted = 0
  const errors: Array<{ project_id: string; error: string }> = []

  for (const project of projects) {
    try {
      const r = await processProject(supabase, project)
      totalWinners += r.winners
      totalDemoted += r.demoted
      totalPromoted += r.promoted
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      errors.push({ project_id: project.id, error: msg })
    }
  }

  return Response.json({
    tick_at: new Date().toISOString(),
    projects: projects.length,
    winners: totalWinners,
    demoted: totalDemoted,
    promoted: totalPromoted,
    errors: errors.slice(0, 10),
  })
}

export const GET = wrapHandler(handleRequest, 'social/winner-tick')
export const POST = wrapHandler(handleRequest, 'social/winner-tick')
