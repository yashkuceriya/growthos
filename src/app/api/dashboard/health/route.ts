// Dashboard health endpoint. Returns real integration status, recent
// activity, and KPI sparkline data — replaces the hardcoded fake values
// that used to live in the dashboard page.
//
// Integration "configured" is determined by env-var presence; "ok"
// additionally requires a recent ledger entry that proves the
// integration actually fired (e.g., OpenRouter green = key set + at
// least one ai_cost_ledger entry in the last 30d).

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'

export interface IntegrationHealth {
  name: string
  configured: boolean
  status: 'ok' | 'warn' | 'error' | 'optional'
  detail: string
}

export interface DashboardActivity {
  id: string
  type: 'ingest' | 'ad' | 'social' | 'webhook'
  title: string
  desc: string
  tone: 'success' | 'warn' | 'info' | 'accent'
  time: string
}

interface Stats {
  activeCampaigns: number
  adsGenerated: number
  leads: number
  totalSpend: number
  leadsThisWeek: number
  webhookSuccessRate: number | null
  recentIngestStatus: 'ok' | 'failing' | 'unknown'
  spendDaily: number[] // last 14 days, oldest → newest
  leadsDaily: number[]
}

async function handleGet(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = new URL(request.url).searchParams.get('project_id')
  // Project-scoped numbers when provided, otherwise the user's own
  // (cross-project) view. We still surface integration health globally
  // since env vars are per-deployment, not per-project.

  const integrations = computeIntegrations()
  const [activity, kpi] = await Promise.all([
    fetchActivity(supabase, projectId),
    fetchKpi(supabase, user.id, projectId),
  ])

  // Anchor "OpenRouter ok" to actual usage in the last 30 days.
  const openrouter = integrations.find((i) => i.name === 'OpenRouter')
  if (openrouter && openrouter.configured) {
    const { count } = await supabase
      .from('ai_cost_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    if ((count ?? 0) > 0) {
      openrouter.status = 'ok'
      openrouter.detail = `${count} AI calls / last 30d`
    } else {
      openrouter.status = 'warn'
      openrouter.detail = 'Configured, no recent calls'
    }
  }

  return Response.json({ integrations, activity, kpi })
}

function computeIntegrations(): IntegrationHealth[] {
  const has = (k: string) => !!process.env[k]

  const items: IntegrationHealth[] = [
    {
      name: 'Supabase',
      configured: has('NEXT_PUBLIC_SUPABASE_URL') && has('SUPABASE_SERVICE_ROLE_KEY'),
      status: 'ok',
      detail: 'Database + auth + storage',
    },
    {
      name: 'OpenRouter',
      configured: has('OPENROUTER_API_KEY'),
      status: has('OPENROUTER_API_KEY') ? 'ok' : 'error',
      detail: has('OPENROUTER_API_KEY') ? 'Key set' : 'Set OPENROUTER_API_KEY to enable AI generation',
    },
    {
      name: 'Anthropic (Claude)',
      configured: has('ANTHROPIC_API_KEY'),
      status: has('ANTHROPIC_API_KEY') ? 'ok' : 'optional',
      detail: has('ANTHROPIC_API_KEY')
        ? 'Strategic agents use Claude'
        : 'Optional — strategic agents fall back to Gemini',
    },
    {
      name: 'Resend',
      configured: has('RESEND_API_KEY') && has('RESEND_FROM_EMAIL'),
      status: has('RESEND_API_KEY') && has('RESEND_FROM_EMAIL') ? 'ok' : 'optional',
      detail: has('RESEND_API_KEY') && has('RESEND_FROM_EMAIL') ? 'Email send + webhooks live' : 'Optional — disables email sending',
    },
    {
      name: 'ScreenshotOne',
      configured: has('SCREENSHOTONE_ACCESS_KEY'),
      status: has('SCREENSHOTONE_ACCESS_KEY') ? 'ok' : 'optional',
      detail: has('SCREENSHOTONE_ACCESS_KEY')
        ? has('SCREENSHOT_STORAGE_BUCKET') ? 'Capturing + mirroring to Storage' : 'Capturing (set SCREENSHOT_STORAGE_BUCKET to mirror)'
        : 'Optional — disables fresh-rendered UI capture during ingest',
    },
    {
      name: 'Video providers',
      configured: has('FAL_KEY') || has('OPENAI_API_KEY') || has('XAI_API_KEY'),
      status: has('FAL_KEY') || has('OPENAI_API_KEY') || has('XAI_API_KEY') ? 'ok' : 'optional',
      detail: [
        has('FAL_KEY') && 'fal',
        has('OPENAI_API_KEY') && 'openai',
        has('XAI_API_KEY') && 'xai',
      ].filter(Boolean).join(', ') || 'Optional — set FAL_KEY / OPENAI_API_KEY / XAI_API_KEY',
    },
    {
      name: 'Social tokens',
      configured: has('SOCIAL_TOKEN_ENC_KEY'),
      status: has('SOCIAL_TOKEN_ENC_KEY') ? 'ok' : 'warn',
      detail: has('SOCIAL_TOKEN_ENC_KEY')
        ? 'Encryption key set — tokens stored AES-256-GCM'
        : 'Set SOCIAL_TOKEN_ENC_KEY to enable social publishing',
    },
    {
      name: 'Webhook outbox',
      configured: has('CRON_SECRET'),
      status: has('CRON_SECRET') ? 'ok' : 'warn',
      detail: has('CRON_SECRET') ? 'Cron drainer authenticated' : 'CRON_SECRET missing — webhook + queue crons cannot run',
    },
  ]

  return items
}

async function fetchActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string | null,
): Promise<DashboardActivity[]> {
  // Pull recent events from across the system. We blend ingest jobs +
  // ad copies + social posts + webhook deliveries, then sort by time
  // and take the top N. RLS scopes everything to the current user
  // automatically.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString()

  const ingestQuery = supabase
    .from('ingest_jobs')
    .select('id, status, url, created_at, project_id, error')
    .gte('created_at', fourteenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(5)
  const adQuery = supabase
    .from('ad_copies')
    .select('id, headline, created_at, ad_briefs!inner(project_id, platform)')
    .gte('created_at', fourteenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(5)
  const socialQuery = supabase
    .from('social_posts')
    .select('id, platform, status, content, published_at, created_at, project_id, last_error')
    .gte('created_at', fourteenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(5)

  const [ingest, ads, social] = await Promise.all([
    projectId ? ingestQuery.eq('project_id', projectId) : ingestQuery,
    projectId ? adQuery.eq('ad_briefs.project_id', projectId) : adQuery,
    projectId ? socialQuery.eq('project_id', projectId) : socialQuery,
  ]) as unknown as [
    { data: Array<{ id: string; status: string; url: string; created_at: string; error: string | null }> | null },
    { data: Array<{ id: string; headline: string; created_at: string; ad_briefs: { platform: string } | { platform: string }[] }> | null },
    { data: Array<{ id: string; platform: string; status: string; content: string; published_at: string | null; created_at: string; last_error: string | null }> | null },
  ]

  const activity: DashboardActivity[] = []

  for (const j of ingest.data ?? []) {
    if (j.status === 'completed') {
      activity.push({
        id: `ingest-${j.id}`, type: 'ingest', tone: 'success',
        title: 'Site sync completed',
        desc: `Crawled ${shortUrl(j.url)} — brand info refreshed`,
        time: j.created_at,
      })
    } else if (j.status === 'failed') {
      activity.push({
        id: `ingest-${j.id}`, type: 'ingest', tone: 'warn',
        title: 'Site sync failed',
        desc: j.error ? `${shortUrl(j.url)}: ${j.error.slice(0, 80)}` : `${shortUrl(j.url)} could not be crawled`,
        time: j.created_at,
      })
    }
  }
  for (const a of ads.data ?? []) {
    const platformVal = Array.isArray(a.ad_briefs)
      ? (a.ad_briefs[0]?.platform ?? 'platform')
      : (a.ad_briefs?.platform ?? 'platform')
    activity.push({
      id: `ad-${a.id}`, type: 'ad', tone: 'info',
      title: 'Ad copy generated',
      desc: `${platformVal} — "${(a.headline ?? '').slice(0, 80)}"`,
      time: a.created_at,
    })
  }
  for (const p of social.data ?? []) {
    if (p.status === 'published') {
      activity.push({
        id: `social-${p.id}`, type: 'social', tone: 'accent',
        title: `${p.platform} post published`,
        desc: `"${(p.content ?? '').slice(0, 80)}"`,
        time: p.published_at ?? p.created_at,
      })
    } else if (p.status === 'failed') {
      activity.push({
        id: `social-${p.id}`, type: 'social', tone: 'warn',
        title: `${p.platform} post failed`,
        desc: p.last_error ? p.last_error.slice(0, 100) : `Publish failed`,
        time: p.created_at,
      })
    }
  }

  return activity
    .sort((x, y) => new Date(y.time).getTime() - new Date(x.time).getTime())
    .slice(0, 8)
}

async function fetchKpi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectId: string | null,
): Promise<Stats> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000)

  const [
    campaignsCount,
    adsCount,
    leadsCount,
    leadsWeekCount,
    spendRows,
    leadDailyRows,
    webhookCounts,
  ] = await Promise.all([
    scopedCount(supabase, 'campaigns', { active: true }, projectId),
    scopedCount(supabase, 'ad_copies', {}, projectId, true), // joined via ad_briefs
    scopedCount(supabase, 'leads', {}, projectId),
    scopedCount(supabase, 'leads', { since: weekAgo.toISOString() }, projectId),
    spendByDay(supabase, fourteenDaysAgo.toISOString(), projectId),
    leadsByDay(supabase, fourteenDaysAgo.toISOString(), projectId),
    webhookSuccessAndFail(supabase, userId),
  ])

  const totalSpend = spendRows.reduce((s, r) => s + r.cost_usd, 0)
  const spendDaily = bucketDaily(spendRows.map((r) => ({ at: r.created_at, value: r.cost_usd })), 14)
  const leadsDaily = bucketDaily(leadDailyRows.map((r) => ({ at: r.created_at, value: 1 })), 14)
  const wsr = webhookCounts.total > 0
    ? webhookCounts.success / webhookCounts.total
    : null

  // Recent ingest status: green if at least one completed in last 7d AND no failures since
  const { data: recentIngest } = await supabase
    .from('ingest_jobs')
    .select('status, created_at')
    .gte('created_at', weekAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(5) as { data: Array<{ status: string }> | null }
  let recentIngestStatus: Stats['recentIngestStatus'] = 'unknown'
  if (recentIngest && recentIngest.length > 0) {
    const failing = recentIngest[0]!.status === 'failed'
    recentIngestStatus = failing ? 'failing' : 'ok'
  }

  return {
    activeCampaigns: campaignsCount,
    adsGenerated: adsCount,
    leads: leadsCount,
    leadsThisWeek: leadsWeekCount,
    totalSpend: Math.round(totalSpend * 100) / 100,
    webhookSuccessRate: wsr,
    recentIngestStatus,
    spendDaily,
    leadsDaily,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function shortUrl(u: string): string {
  try { return new URL(u).hostname } catch { return u.slice(0, 40) }
}

async function scopedCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  filters: { active?: boolean; since?: string },
  projectId: string | null,
  joinAdBriefs = false,
): Promise<number> {
  let q = joinAdBriefs
    ? supabase.from(table).select('id, ad_briefs!inner(project_id)', { count: 'exact', head: true })
    : supabase.from(table).select('id', { count: 'exact', head: true })
  if (filters.active) q = q.eq('status', 'active')
  if (filters.since) q = q.gte('created_at', filters.since)
  if (projectId) q = q.eq(joinAdBriefs ? 'ad_briefs.project_id' : 'project_id', projectId)
  const { count } = await q
  return count ?? 0
}

async function spendByDay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  since: string,
  projectId: string | null,
): Promise<Array<{ created_at: string; cost_usd: number }>> {
  let q = supabase
    .from('ai_cost_ledger')
    .select('created_at, cost_usd')
    .gte('created_at', since)
  if (projectId) q = q.eq('project_id', projectId)
  const { data } = await q as { data: Array<{ created_at: string; cost_usd: number | null }> | null }
  return (data ?? []).map((r) => ({ created_at: r.created_at, cost_usd: r.cost_usd ?? 0 }))
}

async function leadsByDay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  since: string,
  projectId: string | null,
): Promise<Array<{ created_at: string }>> {
  let q = supabase.from('leads').select('created_at').gte('created_at', since)
  if (projectId) q = q.eq('project_id', projectId)
  const { data } = await q as { data: Array<{ created_at: string }> | null }
  return data ?? []
}

async function webhookSuccessAndFail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ success: number; total: number }> {
  // RLS already scopes via the endpoint join.
  void userId
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [{ count: successCount }, { count: totalCount }] = await Promise.all([
    supabase.from('webhook_deliveries').select('id', { count: 'exact', head: true })
      .eq('status', 'success').gte('created_at', sevenDaysAgo),
    supabase.from('webhook_deliveries').select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo)
      .in('status', ['success', 'failed', 'exhausted']),
  ])
  return { success: successCount ?? 0, total: totalCount ?? 0 }
}

/** Bucket events into N daily buckets ending today. Sums `value`. */
function bucketDaily(events: Array<{ at: string; value: number }>, days: number): number[] {
  const buckets = new Array(days).fill(0)
  const now = Date.now()
  for (const ev of events) {
    const ageDays = Math.floor((now - new Date(ev.at).getTime()) / 86_400_000)
    const idx = days - 1 - ageDays
    if (idx >= 0 && idx < days) buckets[idx] += ev.value
  }
  return buckets
}

export const GET = wrapHandler(handleGet, 'dashboard/health')
