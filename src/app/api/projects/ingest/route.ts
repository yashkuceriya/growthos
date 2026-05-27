// Dashboard ingest route. Session-authed; the user is operating on their own
// projects via cookie auth. Real work lives in lib/ai/intelligence/ingest.ts
// so the v1 public API route can reuse it.

export const runtime = 'nodejs'
export const maxDuration = 120

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { runIngest } from '@/lib/ai/intelligence/ingest'

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, url } = await request.json().catch(() => ({}))
  if (!projectId || !url) return Response.json({ error: 'Missing projectId or url' }, { status: 400 })

  // Defense-in-depth: explicitly assert ownership before running side effects.
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  try {
    const { brand } = await runIngest({ supabase, userId: user.id, projectId, url })
    return Response.json({ brand })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ingest failed'
    // Network / fetch errors are 400-class; everything else is 500.
    const status = msg.startsWith('Failed to fetch site') ? 400 : 500
    return Response.json({ error: msg }, { status })
  }
}

export const POST = wrapHandler(handlePost, 'projects/ingest')
