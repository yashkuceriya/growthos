// Attribution rollup for the analytics page.
// Fetches leads in a project + window, joins campaign names, returns
// pre-aggregated buckets so the client doesn't have to push thousands of
// lead rows over the wire.

export const runtime = 'nodejs'
export const maxDuration = 30

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import {
  rollupBySource,
  rollupByMedium,
  rollupByCampaign,
  rollupBySourceMedium,
  summarize,
  type LeadRow,
} from '@/lib/analytics/attribution'

async function handleRequest(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('project_id')
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days') ?? '30')))
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 })

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // RLS scopes leads to the calling user automatically. We still scope by
  // project so cross-project queries don't leak across the user's products.
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, source, campaign_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, status, created_at, converted_at')
    .eq('project_id', projectId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false }) as { data: LeadRow[] | null; error: { message: string } | null }

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const leadList = leads ?? []

  // Pull campaign names for any campaign_id present in the leads. Limit the
  // round-trip to just the campaigns that actually appear.
  const campaignIds = [...new Set(leadList.map((l) => l.campaign_id).filter((x): x is string => !!x))]
  const campaignNames = new Map<string, string>()
  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name')
      .in('id', campaignIds) as { data: Array<{ id: string; name: string }> | null }
    for (const c of campaigns ?? []) campaignNames.set(c.id, c.name)
  }

  return Response.json({
    window_days: days,
    summary: summarize(leadList),
    by_source: rollupBySource(leadList),
    by_medium: rollupByMedium(leadList),
    by_campaign: rollupByCampaign(leadList, campaignNames),
    by_source_medium: rollupBySourceMedium(leadList),
  })
}

export const GET = wrapHandler(handleRequest, 'analytics/attribution')
