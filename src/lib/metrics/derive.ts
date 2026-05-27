// Pure derived-metrics helpers — same math the manual logger UI and the
// analytics dashboard both want. Kept separate from the API so tests can
// pin the formulas without spinning up the route.
export interface MetricRow {
  impressions: number
  clicks: number
  conversions: number
  spend: number
  revenue: number
}

export interface DerivedMetrics {
  ctr: number | null            // clicks / impressions
  conversion_rate: number | null // conversions / clicks
  cpc: number | null            // spend / clicks
  cpl: number | null            // spend / conversions
  roas: number | null           // revenue / spend
}

export function deriveMetrics(row: MetricRow): DerivedMetrics {
  return {
    ctr: row.impressions > 0 ? row.clicks / row.impressions : null,
    conversion_rate: row.clicks > 0 ? row.conversions / row.clicks : null,
    cpc: row.clicks > 0 ? row.spend / row.clicks : null,
    cpl: row.conversions > 0 ? row.spend / row.conversions : null,
    roas: row.spend > 0 ? row.revenue / row.spend : null,
  }
}

export function aggregateRows(rows: MetricRow[]): MetricRow & DerivedMetrics {
  const totals: MetricRow = rows.reduce<MetricRow>(
    (acc, r) => ({
      impressions: acc.impressions + (r.impressions || 0),
      clicks: acc.clicks + (r.clicks || 0),
      conversions: acc.conversions + (r.conversions || 0),
      spend: acc.spend + (r.spend || 0),
      revenue: acc.revenue + (r.revenue || 0),
    }),
    { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 },
  )
  return { ...totals, ...deriveMetrics(totals) }
}

export interface ChannelRollup extends MetricRow, DerivedMetrics {
  channel: string
  days: number
}

export function rollupByChannel(rows: Array<MetricRow & { channel: string }>): ChannelRollup[] {
  const buckets = new Map<string, MetricRow & { days: number }>()
  for (const r of rows) {
    const existing = buckets.get(r.channel) ?? { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0, days: 0 }
    existing.impressions += r.impressions || 0
    existing.clicks += r.clicks || 0
    existing.conversions += r.conversions || 0
    existing.spend += r.spend || 0
    existing.revenue += r.revenue || 0
    existing.days += 1
    buckets.set(r.channel, existing)
  }
  return Array.from(buckets.entries())
    .map(([channel, totals]) => ({ channel, ...totals, ...deriveMetrics(totals) }))
    .sort((a, b) => b.spend - a.spend)
}

export function formatPct(value: number | null, digits = 2): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatMoney(value: number | null, digits = 2): string {
  if (value == null) return '—'
  return `$${value.toFixed(digits)}`
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}
