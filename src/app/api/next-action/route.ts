// GET /api/next-action?projectId=<uuid>
//
// Returns the single highest-leverage action the operator should take next
// for the given project. Read-only aggregator: loads project state, the
// latest campaign + asset state, manual-metrics presence, winner presence,
// and AI budget status, then hands the snapshot to the deterministic
// nextBestAction() helper.
//
// Designed to be safe to call on every dashboard render — N+1-friendly fan-out,
// each branch wrapped so a slow table can't break the whole response.
import { createClient } from '@/lib/supabase/server'
import { getMarketingMemory } from '@/lib/marketing/memory'
import { nextBestAction, type NextActionSnapshot } from '@/lib/marketing/next-action'
import { checkBudget } from '@/lib/budget-guard'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const focusCampaignIdParam = url.searchParams.get('campaignId')

  // No active project yet — short-circuit with the create-project nudge.
  if (!projectId) {
    return Response.json({
      action: nextBestAction({ hasProject: false }),
      snapshot: { hasProject: false },
    })
  }

  // Verify ownership; foreign / missing → treat as "no project" so the
  // dashboard renders something instead of 404ing.
  const { data: project } = await supabase
    .from('projects')
    .select('id, website')
    .eq('id', projectId)
    .maybeSingle() as { data: { id: string; website: string | null } | null }
  if (!project) {
    return Response.json({
      action: nextBestAction({ hasProject: false }),
      snapshot: { hasProject: false },
    })
  }

  // Memory gives us the blueprint, classification, founder voice and
  // style references in one bundle — perfect for the snapshot.
  const memoryPromise = getMarketingMemory({
    supabase,
    userId: user.id,
    projectId,
  })

  // Latest campaign for this project; we use the latest as the
  // "current operating context" for the snapshot.
  const latestCampaignPromise = supabase
    .from('campaigns')
    .select('id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const campaignCountPromise = supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const budgetPromise = checkBudget(supabase, projectId).catch(() => ({ ok: true } as { ok: boolean }))

  const [memory, latestCampaign, campaignCount, budget] = await Promise.all([
    memoryPromise, latestCampaignPromise, campaignCountPromise, budgetPromise,
  ])

  const latestCampaignRow = (latestCampaign as { data?: { id: string } | null } | null)?.data ?? null
  const latestCampaignId = latestCampaignRow?.id ?? null

  let focusCampaignId: string | null = null
  if (focusCampaignIdParam) {
    const { data: camp } = await supabase
      .from('campaigns')
      .select('id, project_id')
      .eq('id', focusCampaignIdParam)
      .eq('user_id', user.id)
      .maybeSingle() as { data: { id: string; project_id: string } | null }
    if (camp && camp.project_id === projectId) focusCampaignId = camp.id
  }

  const effectiveCampaignId = focusCampaignId ?? latestCampaignId

  // Per-campaign asset + needs-review snapshot. Skipped when no campaigns.
  let latestCampaignAssetCount = 0
  let adsNeedingReview = 0
  let socialPostsDraft = 0
  let socialPostsScheduled = 0
  let hasMeasurements = false
  let hasManualMetrics = false
  let hasWinners = false

  if (effectiveCampaignId) {
    const [adsRes, socialDraftRes, socialScheduledRes, socialEngagedRes, metricsRes, winnersRes, blogsRes, landingsRes] = await Promise.all([
      supabase.from('ad_copies')
        .select('id, status, ad_briefs!inner(campaign_id)')
        .eq('ad_briefs.campaign_id', effectiveCampaignId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', effectiveCampaignId)
        .eq('status', 'draft'),
      supabase.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', effectiveCampaignId)
        .eq('status', 'scheduled'),
      supabase.from('social_posts')
        .select('id, engagement')
        .eq('campaign_id', effectiveCampaignId)
        .eq('status', 'published')
        .limit(10),
      supabase.from('campaign_metrics')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', effectiveCampaignId),
      supabase.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', effectiveCampaignId)
        .eq('is_winner', true),
      supabase.from('content_pieces')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', effectiveCampaignId),
      supabase.from('landing_pages')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', effectiveCampaignId),
    ])

    const ads = (adsRes.data ?? []) as Array<{ status: string }>
    latestCampaignAssetCount += ads.length
    adsNeedingReview = ads.filter((a) => a.status === 'evaluator_pass' || a.status === 'compliance_pass').length

    socialPostsDraft = (socialDraftRes as unknown as { count?: number | null }).count ?? 0
    socialPostsScheduled = (socialScheduledRes as unknown as { count?: number | null }).count ?? 0
    latestCampaignAssetCount += socialPostsDraft + socialPostsScheduled
    latestCampaignAssetCount += ((blogsRes as unknown as { count?: number | null }).count ?? 0)
    latestCampaignAssetCount += ((landingsRes as unknown as { count?: number | null }).count ?? 0)

    hasManualMetrics = ((metricsRes as unknown as { count?: number | null }).count ?? 0) > 0
    hasWinners = ((winnersRes as unknown as { count?: number | null }).count ?? 0) > 0

    const published = (socialEngagedRes.data ?? []) as Array<{ engagement: unknown }>
    hasMeasurements = published.some((p) => p.engagement && typeof p.engagement === 'object')
    if (published.length > 0) latestCampaignAssetCount += published.length
  }

  const snapshot: NextActionSnapshot = {
    hasProject: true,
    projectWebsite: project.website,
    blueprint: memory.blueprint,
    campaignCount: (campaignCount as unknown as { count?: number | null }).count ?? 0,
    latestCampaignId: effectiveCampaignId,
    latestCampaignAssetCount,
    adsNeedingReview,
    socialPostsDraft,
    socialPostsScheduled,
    hasMeasurements,
    hasManualMetrics,
    hasInsights: memory.launchInsights.current !== null,
    hasWinners,
    budgetExceeded: !budget.ok && !('unavailable' in budget && budget.unavailable),
  }

  return Response.json({
    action: nextBestAction(snapshot),
    snapshot,
  })
}
