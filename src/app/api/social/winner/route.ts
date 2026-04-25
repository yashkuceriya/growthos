// Manual promote / demote a single post as a winner from the social UI.
// Authenticated via session, ownership-checked. The cron may overwrite the
// flag on its next run if the post no longer scores high enough — by design,
// manual promotion is a strong signal but not eternal.

export const runtime = 'nodejs'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { scorePost } from '@/lib/ai/social/winner'
import type { SocialPostRow } from '@/lib/deploy/types'

async function loadOwnedPost(request: Request): Promise<{ post: SocialPostRow } | { error: Response }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return { error: Response.json({ error: 'id required' }, { status: 400 }) }

  const { data: post } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle() as { data: SocialPostRow | null }

  if (!post) return { error: Response.json({ error: 'Post not found' }, { status: 404 }) }
  return { post }
}

async function handlePost(request: Request) {
  const r = await loadOwnedPost(request)
  if ('error' in r) return r.error
  const { post } = r

  if (post.status !== 'published') {
    return Response.json({ error: 'Only published posts can be promoted' }, { status: 400 })
  }

  const score = scorePost(post)
  const service = createServiceClient()

  await service
    .from('social_posts')
    .update({
      is_winner: true,
      winner_score: score,
      winner_promoted_at: new Date().toISOString(),
    })
    .eq('id', post.id)

  // Mirror to style_references if not already there. Same idempotency check
  // as the cron path.
  const { data: existing } = await service
    .from('style_references')
    .select('id')
    .eq('source_post_id', post.id)
    .maybeSingle()

  if (!existing) {
    const { error } = await service.from('style_references').insert({
      user_id: post.user_id,
      project_id: post.project_id,
      asset_kind: `${post.platform}_post`,
      asset_content: post.content,
      why_good: `Manually promoted as a top-performing ${post.platform} post`,
      metric_proof: JSON.stringify({ ...((post.engagement ?? {}) as Record<string, unknown>), score }),
      source_post_id: post.id,
    })
    // 23505 = unique_violation. The partial unique index on source_post_id
    // catches the case where a concurrent request (double-click, or the cron
    // racing) already inserted the same ref. Treat as success.
    if (error && error.code !== '23505') {
      return Response.json({ error: error.message }, { status: 500 })
    }
  }

  return Response.json({ ok: true, score })
}

async function handleDelete(request: Request) {
  const r = await loadOwnedPost(request)
  if ('error' in r) return r.error
  const { post } = r

  const service = createServiceClient()
  await service
    .from('social_posts')
    .update({ is_winner: false, winner_promoted_at: null })
    .eq('id', post.id)

  // Pull the matching style_ref (if any) so the user's manual demote also
  // removes it from future generation prompts.
  await service.from('style_references').delete().eq('source_post_id', post.id)

  return Response.json({ ok: true })
}

export const POST = wrapHandler(handlePost, 'social/winner')
export const DELETE = wrapHandler(handleDelete, 'social/winner')
