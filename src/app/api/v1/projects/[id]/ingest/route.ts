// Public API: trigger a re-crawl / brand refresh on a project.
//
//   POST /api/v1/projects/:id/ingest
//   Authorization: Bearer gos_live_xxx  (scope: projects:ingest)
//   { url?: string }   — optional override; falls back to project.website
//
// Authenticated via API key (not session). We use the service client to run
// the ingest and gate ownership manually via auth.userId.
//
// This used to return 202 "accepted" without doing the work. Now it actually
// runs the crawl synchronously and returns the merged brand_voice patch.

export const runtime = 'nodejs'
export const maxDuration = 120

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { authenticateApiKey } from '@/lib/api-auth'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'
import { runIngest } from '@/lib/ai/intelligence/ingest'

async function handlePost(request: Request) {
  const auth = await authenticateApiKey(request, 'projects:ingest')
  if (!auth.ok) return auth.response

  // /api/v1/projects/:id/ingest → grab :id from the path
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const projectId = parts[parts.length - 2] ?? ''
  if (!projectId) return Response.json({ error: 'Missing project id' }, { status: 400 })

  const { url: overrideUrl } = await request.json().catch(() => ({}))

  const supabase = createServiceClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id, website')
    .eq('id', projectId)
    .maybeSingle() as { data: { id: string; user_id: string; website: string | null } | null }

  if (!project || project.user_id !== auth.userId) {
    return Response.json({ error: 'Project not found or not accessible with this key' }, { status: 404 })
  }

  const targetUrl = overrideUrl || project.website
  if (!targetUrl) {
    return Response.json({ error: 'No url provided and project has no website set' }, { status: 400 })
  }

  // AI budget cap — ingest does an LLM call per run.
  const budget = await checkBudget(supabase, projectId)
  if (!budget.ok) return budgetExceededResponse(budget)

  try {
    const { brand } = await runIngest({
      supabase,
      userId: auth.userId,
      projectId,
      url: targetUrl,
    })
    return Response.json({ status: 'ok', project_id: projectId, brand })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ingest failed'
    const status = msg.startsWith('Failed to fetch site') ? 400 : 500
    return Response.json({ error: msg }, { status })
  }
}

export const POST = wrapHandler(handlePost, 'v1/projects/:id/ingest')
