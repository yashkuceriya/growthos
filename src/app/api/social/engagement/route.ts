// Manual "Refresh stats" trigger from the social UI. Authenticated via
// session cookie; user can only sync posts they own.

export const runtime = 'nodejs'
export const maxDuration = 30

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { syncPostEngagement } from '@/lib/deploy/engagement'
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

  const service = createServiceClient()
  const outcome = await syncPostEngagement(service, post)

  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: 502 })
  }
  return Response.json({ ok: true, engagement: outcome.engagement })
}

export const POST = wrapHandler(handleRequest, 'social/engagement')
