// GET /api/launch/plan?projectId=<uuid>
//
// Returns the recommended launch plan for a project: vertical, ICP, primary
// KPI, recommended channels with rationale, content mix, launch tactics,
// readiness, suggested angles, and defaults. Used by /launch to show the
// operator what GrowthOS would do before they spend any AI budget.
//
// Read-only. RLS scopes the project lookup to the signed-in user.
import { createClient } from '@/lib/supabase/server'
import { getMarketingMemory } from '@/lib/marketing/memory'
import { buildLaunchPlan } from '@/lib/launch/plan'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  // Verify ownership explicitly. Memory fetcher uses RLS but we want a
  // clear 404 (not a half-built plan with empty defaults) when the project
  // doesn't belong to the user.
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle() as { data: { id: string } | null }
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const memory = await getMarketingMemory({
    supabase,
    userId: user.id,
    projectId,
  })

  const plan = buildLaunchPlan({ memory })

  return Response.json({ plan })
}
