// Video render listing for the /video page. RLS scopes to the calling user;
// we additionally filter by project_id when supplied.

export const runtime = 'nodejs'

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'

async function handleGet(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('project_id')
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50')))

  let query = supabase
    .from('video_renders')
    .select('id, project_id, model, provider, prompt, duration_seconds, status, video_url, thumbnail_url, error, attached_to_type, attached_to_id, metadata, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ renders: data ?? [] })
}

export const GET = wrapHandler(handleGet, 'video/renders')
