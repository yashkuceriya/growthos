// Manual "Publish now" trigger from the social UI. Authenticated via the user's
// session — they can only publish posts they own. Uses the service client for
// the dispatch itself so we can update the row regardless of RLS quirks, but
// gates ownership above.

export const runtime = 'nodejs'
export const maxDuration = 60

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { dispatchPost } from '@/lib/deploy'
import type { SocialPostRow } from '@/lib/deploy/types'

async function handleRequest(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { id?: string }
  if (!body.id) return Response.json({ error: 'id required' }, { status: 400 })

  const { data: post } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', body.id)
    .eq('user_id', user.id)
    .maybeSingle() as { data: SocialPostRow | null }

  if (!post) return Response.json({ error: 'Post not found' }, { status: 404 })
  if (post.status === 'published') {
    return Response.json({ ok: true, status: 'published', externalUrl: post.external_url })
  }

  const service = createServiceClient()
  const outcome = await dispatchPost(service, post)

  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, status: outcome.finalStatus },
      { status: 502 },
    )
  }

  return Response.json({
    ok: true,
    status: outcome.finalStatus,
    externalId: outcome.externalId,
    externalUrl: outcome.externalUrl,
  })
}

export const POST = wrapHandler(handleRequest, 'social/publish')
