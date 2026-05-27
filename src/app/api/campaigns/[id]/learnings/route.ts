// GET /api/campaigns/:id/learnings
//
// Aggregates everything we know about a campaign — manual metrics, ad
// copies, social posts, email templates, prior launch insights — and runs
// the deterministic summarizeCampaign() helper to produce a LearningSummary
// the UI can render and the next launch's Marketing Memory can consume.
//
// On success this also persists the summary back onto the campaign's
// metadata so the same payload is available offline (the campaign page
// renders it instantly; the next launch reads it on the way in).
//
// RLS-scoped via the session client; ownership is double-checked up front.
import { createClient } from '@/lib/supabase/server'
import { summarizeCampaign, type LearningSummaryInputs } from '@/lib/campaigns/learning'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await ctx.params
  if (!campaignId) return Response.json({ error: 'campaign id required' }, { status: 400 })

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, project_id, metadata')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; project_id: string; metadata: Record<string, unknown> | null } | null }
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  const [metricsRes, adsRes, socialRes, emailsRes, projectRes] = await Promise.all([
    supabase
      .from('campaign_metrics')
      .select('channel, date, impressions, clicks, conversions, spend, revenue')
      .eq('campaign_id', campaignId),
    supabase
      .from('ad_copies')
      .select('id, status, weighted_average, headline, primary_text, is_best, ad_briefs!inner(campaign_id)')
      .eq('ad_briefs.campaign_id', campaignId),
    supabase
      .from('social_posts')
      .select('id, platform, content, is_winner, engagement')
      .eq('campaign_id', campaignId),
    supabase
      .from('email_templates')
      .select('id, name, subject, is_winner, project_id')
      .eq('project_id', campaign.project_id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('projects')
      .select('brand_voice')
      .eq('id', campaign.project_id)
      .maybeSingle(),
  ])

  const inputs: LearningSummaryInputs = {
    metrics: (metricsRes.data ?? []).map((row: Record<string, unknown>) => ({
      channel: (row.channel as string) ?? 'unknown',
      date: (row.date as string) ?? '',
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      conversions: Number(row.conversions ?? 0),
      spend: Number(row.spend ?? 0),
      revenue: Number(row.revenue ?? 0),
    })),
    ads: (adsRes.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      status: (row.status as string) ?? 'iterating',
      weighted_average: row.weighted_average == null ? null : Number(row.weighted_average),
      headline: (row.headline as string | null) ?? null,
      primary_text: (row.primary_text as string | null) ?? null,
      is_best: (row.is_best as boolean | null) ?? false,
    })),
    social: (socialRes.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      platform: (row.platform as string) ?? 'social',
      content: (row.content as string | null) ?? '',
      is_winner: (row.is_winner as boolean | null) ?? false,
      engagement: (row.engagement as { likes?: number; replies?: number; shares?: number; impressions?: number | null } | null) ?? null,
    })),
    email: await enrichEmailsWithStats(supabase, (emailsRes.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: (row.name as string | null) ?? '',
      subject: (row.subject as string | null) ?? null,
      is_winner: (row.is_winner as boolean | null) ?? false,
    }))),
    insights: {
      current: readCurrentInsights((projectRes as { data?: { brand_voice?: Record<string, unknown> } | null }).data?.brand_voice ?? null),
    },
  }

  const summary = summarizeCampaign(inputs)

  // Persist back onto the campaign metadata so the next page-load is
  // instant and the next launch can read it without recomputing. Fire-and-
  // forget — failure here doesn't break the response.
  void persistSummary(supabase, campaignId, campaign.metadata, summary)

  return Response.json({ summary, inputs: { counts: summary.inputCounts } })
}

// Email template stats live in `email_sends`. We pull a one-shot aggregate
// per template id so the summarizer can score open/click rates.
async function enrichEmailsWithStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  templates: Array<{ id: string; name: string; subject: string | null; is_winner: boolean }>,
): Promise<LearningSummaryInputs['email']> {
  if (templates.length === 0) return []
  const ids = templates.map((t) => t.id)
  const { data } = await supabase
    .from('email_sends')
    .select('template_id, status')
    .in('template_id', ids) as { data: Array<{ template_id: string; status: string }> | null }

  const byId = new Map<string, { sends: number; opens: number; clicks: number }>()
  for (const row of data ?? []) {
    const entry = byId.get(row.template_id) ?? { sends: 0, opens: 0, clicks: 0 }
    entry.sends += 1
    // Status flow per Bundle on email: queued → sent → delivered → opened → clicked.
    // We count any row that reached opened/clicked as such (status is the
    // furthest stage reached).
    if (row.status === 'opened' || row.status === 'clicked') entry.opens += 1
    if (row.status === 'clicked') entry.clicks += 1
    byId.set(row.template_id, entry)
  }

  return templates.map((t) => {
    const stats = byId.get(t.id) ?? { sends: 0, opens: 0, clicks: 0 }
    return {
      id: t.id,
      name: t.name,
      subject: t.subject,
      is_winner: t.is_winner,
      sends: stats.sends,
      opens: stats.opens,
      clicks: stats.clicks,
    }
  })
}

function readCurrentInsights(brandVoice: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!brandVoice) return null
  const insights = brandVoice.insights
  if (!insights || typeof insights !== 'object' || Array.isArray(insights)) return null
  const current = (insights as Record<string, unknown>).current
  if (!current || typeof current !== 'object' || Array.isArray(current)) return null
  return current as Record<string, unknown>
}

async function persistSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  campaignId: string,
  existing: Record<string, unknown> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any,
): Promise<void> {
  try {
    const nextMetadata = { ...(existing ?? {}), learning_summary: summary }
    await supabase.from('campaigns').update({ metadata: nextMetadata }).eq('id', campaignId)
  } catch {
    // Best-effort. Persistence failure should not block the read.
  }
}
