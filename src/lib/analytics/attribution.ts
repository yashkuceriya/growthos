// Pure aggregation helpers for lead attribution. The cron / API layer fetches
// raw lead rows; this module groups them by source, campaign, and UTM combos
// so the UI can render rollup tables without doing aggregation client-side.
//
// All functions are pure (no I/O) so they're trivial to unit-test.

export interface LeadRow {
  id: string
  source: string | null
  campaign_id: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  status: string
  created_at: string
  converted_at: string | null
}

export interface AttributionBucket {
  key: string
  display: string
  leads: number
  converted: number
  conversion_rate: number  // converted / leads, 0..1
}

const CONVERTED_STATUSES = new Set(['converted'])

function toRate(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0
}

function pushBucket(
  out: Map<string, { display: string; leads: number; converted: number }>,
  key: string,
  display: string,
  isConverted: boolean,
) {
  const cur = out.get(key) ?? { display, leads: 0, converted: 0 }
  cur.leads += 1
  if (isConverted) cur.converted += 1
  out.set(key, cur)
}

function finalize(map: Map<string, { display: string; leads: number; converted: number }>): AttributionBucket[] {
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      display: v.display,
      leads: v.leads,
      converted: v.converted,
      conversion_rate: toRate(v.converted, v.leads),
    }))
    .sort((a, b) => b.leads - a.leads)
}

export function rollupBySource(leads: LeadRow[]): AttributionBucket[] {
  const map = new Map<string, { display: string; leads: number; converted: number }>()
  for (const lead of leads) {
    const isConverted = lead.status === 'converted' || (lead.converted_at !== null && CONVERTED_STATUSES.has(lead.status))
    // Prefer utm_source over the free-text source field — utm is structured.
    const key = lead.utm_source || lead.source || '(direct)'
    pushBucket(map, key, key, isConverted)
  }
  return finalize(map)
}

export function rollupByMedium(leads: LeadRow[]): AttributionBucket[] {
  const map = new Map<string, { display: string; leads: number; converted: number }>()
  for (const lead of leads) {
    const isConverted = lead.status === 'converted'
    const key = lead.utm_medium || '(none)'
    pushBucket(map, key, key, isConverted)
  }
  return finalize(map)
}

export interface CampaignAttribution extends AttributionBucket {
  campaign_id: string | null
}

/**
 * Roll up leads by campaign_id, optionally enriched with the campaign name
 * (caller passes a {id → name} map). Leads with no campaign_id land in the
 * "(unattributed)" bucket so they're still visible.
 */
export function rollupByCampaign(
  leads: LeadRow[],
  campaignNames: Map<string, string>,
): CampaignAttribution[] {
  const map = new Map<string, { display: string; leads: number; converted: number; campaign_id: string | null }>()
  for (const lead of leads) {
    const isConverted = lead.status === 'converted'
    const cid = lead.campaign_id
    const key = cid ?? '__none__'
    const display = cid ? (campaignNames.get(cid) ?? `Campaign ${cid.slice(0, 8)}`) : '(unattributed)'
    const cur = map.get(key) ?? { display, leads: 0, converted: 0, campaign_id: cid }
    cur.leads += 1
    if (isConverted) cur.converted += 1
    map.set(key, cur)
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      display: v.display,
      leads: v.leads,
      converted: v.converted,
      conversion_rate: toRate(v.converted, v.leads),
      campaign_id: v.campaign_id,
    }))
    .sort((a, b) => b.leads - a.leads)
}

/**
 * Cross-tab roll-up: source × medium combos, useful for identifying which
 * (channel, format) pairings convert (e.g. "newsletter / cta_button" beats
 * "newsletter / footer_link").
 */
export function rollupBySourceMedium(leads: LeadRow[]): AttributionBucket[] {
  const map = new Map<string, { display: string; leads: number; converted: number }>()
  for (const lead of leads) {
    const isConverted = lead.status === 'converted'
    const src = lead.utm_source || lead.source || '(direct)'
    const med = lead.utm_medium || '(none)'
    const key = `${src}::${med}`
    const display = `${src} / ${med}`
    pushBucket(map, key, display, isConverted)
  }
  return finalize(map)
}

export interface AttributionSummary {
  total_leads: number
  total_converted: number
  conversion_rate: number
  attributed_leads: number  // leads with at least one of utm_* OR campaign_id
  attribution_coverage: number  // attributed / total
}

export function summarize(leads: LeadRow[]): AttributionSummary {
  let converted = 0
  let attributed = 0
  for (const lead of leads) {
    if (lead.status === 'converted') converted += 1
    if (lead.campaign_id || lead.utm_source || lead.utm_medium || lead.utm_campaign) attributed += 1
  }
  return {
    total_leads: leads.length,
    total_converted: converted,
    conversion_rate: toRate(converted, leads.length),
    attributed_leads: attributed,
    attribution_coverage: toRate(attributed, leads.length),
  }
}
