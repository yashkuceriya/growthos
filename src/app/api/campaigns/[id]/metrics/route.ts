// /api/campaigns/:id/metrics
//
// Manual metrics logger backing `campaign_metrics`. POST inserts a daily
// per-channel row (or updates an existing one keyed on campaign+date+channel).
// GET returns all rows for a campaign sorted by date desc.
// DELETE removes a row by id.
//
// Designed for self-use entry — paid-network integrations come later. The
// payload is intentionally small: date, channel, impressions, clicks,
// conversions, spend, revenue, notes. Derived metrics (CTR, conversion rate,
// CPC, CPL, ROAS) are computed in the UI from the raw values.
import { createClient } from '@/lib/supabase/server'

const CHANNEL_PATTERN = /^[a-z0-9_\-]{1,32}$/

interface MetricPayload {
  date?: unknown
  channel?: unknown
  impressions?: unknown
  clicks?: unknown
  conversions?: unknown
  spend?: unknown
  revenue?: unknown
  notes?: unknown
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await ctx.params
  if (!campaignId) return Response.json({ error: 'campaign id required' }, { status: 400 })

  // Verify ownership so a 404 reads cleanly when the caller isn't entitled.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string } | null }
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('campaign_metrics')
    .select('id, date, channel, impressions, clicks, conversions, spend, revenue, metadata, created_at')
    .eq('campaign_id', campaignId)
    .order('date', { ascending: false })
    .limit(500)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ metrics: data ?? [] })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await ctx.params
  if (!campaignId) return Response.json({ error: 'campaign id required' }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as MetricPayload
  const validated = validateMetric(body)
  if ('error' in validated) {
    return Response.json({ error: validated.error }, { status: 400 })
  }

  // Verify ownership before writing so we don't trigger the cross-tenant
  // insert silently failing on RLS.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string } | null }
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  // Upsert pattern: a (campaign_id, date, channel) row is replaced when
  // re-submitted so the operator can correct a typo without ending up with
  // duplicate rows for the same day/channel. There's no UNIQUE constraint
  // on those columns today, so we do read-then-update-or-insert manually.
  // For one-user self-use this is fine; a real multi-writer table would
  // want a proper upsert with a partial unique index.
  const { data: existing } = await supabase
    .from('campaign_metrics')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('date', validated.date)
    .eq('channel', validated.channel)
    .maybeSingle() as { data: { id: string } | null }

  if (existing) {
    const { data, error } = await supabase
      .from('campaign_metrics')
      .update({
        impressions: validated.impressions,
        clicks: validated.clicks,
        conversions: validated.conversions,
        spend: validated.spend,
        revenue: validated.revenue,
        metadata: validated.metadata,
      })
      .eq('id', existing.id)
      .select()
      .maybeSingle()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ metric: data, action: 'updated' })
  }

  const { data, error } = await supabase
    .from('campaign_metrics')
    .insert({
      campaign_id: campaignId,
      user_id: user.id,
      date: validated.date,
      channel: validated.channel,
      impressions: validated.impressions,
      clicks: validated.clicks,
      conversions: validated.conversions,
      spend: validated.spend,
      revenue: validated.revenue,
      metadata: validated.metadata,
    })
    .select()
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ metric: data, action: 'created' })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await ctx.params
  if (!campaignId) return Response.json({ error: 'campaign id required' }, { status: 400 })

  const url = new URL(request.url)
  const rowId = url.searchParams.get('rowId')
  if (!rowId) return Response.json({ error: 'rowId query param required' }, { status: 400 })

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string } | null }
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  const { error } = await supabase
    .from('campaign_metrics')
    .delete()
    .eq('id', rowId)
    .eq('campaign_id', campaignId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

interface ValidatedMetric {
  date: string
  channel: string
  impressions: number
  clicks: number
  conversions: number
  spend: number
  revenue: number
  metadata: Record<string, unknown>
}

function validateMetric(body: MetricPayload): ValidatedMetric | { error: string } {
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return { error: 'date must be a YYYY-MM-DD string' }
  }
  if (typeof body.channel !== 'string' || !CHANNEL_PATTERN.test(body.channel.trim())) {
    return { error: 'channel must be a short alphanumeric/underscore string' }
  }

  // Cast numeric fields. Allow zero, reject negatives + non-numbers. Cap at
  // a large but finite limit so an accidental scientific-notation paste
  // ($1e20) doesn't corrupt the row.
  const impressions = toNonNegativeInt(body.impressions, 'impressions')
  if (typeof impressions !== 'number') return impressions
  const clicks = toNonNegativeInt(body.clicks, 'clicks')
  if (typeof clicks !== 'number') return clicks
  const conversions = toNonNegativeInt(body.conversions, 'conversions')
  if (typeof conversions !== 'number') return conversions
  const spend = toNonNegativeNumber(body.spend, 'spend')
  if (typeof spend !== 'number') return spend
  const revenue = toNonNegativeNumber(body.revenue, 'revenue')
  if (typeof revenue !== 'number') return revenue

  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null

  return {
    date: body.date,
    channel: body.channel.trim(),
    impressions,
    clicks,
    conversions,
    spend,
    revenue,
    metadata: notes ? { notes } : {},
  }
}

function toNonNegativeInt(value: unknown, field: string): number | { error: string } {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return { error: `${field} must be a non-negative number under 1e9` }
  return Math.round(n)
}

function toNonNegativeNumber(value: unknown, field: string): number | { error: string } {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return { error: `${field} must be a non-negative number under 1e9` }
  return Math.round(n * 100) / 100
}
