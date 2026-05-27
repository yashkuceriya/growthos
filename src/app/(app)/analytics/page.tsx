'use client'

import { useEffect, useState, useMemo } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, subDays } from 'date-fns'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface CampaignMetric {
  id: string
  campaign_id: string
  channel: string
  date: string
  impressions: number
  clicks: number
  conversions: number
  spend: number
  revenue: number
}

interface AICostEntry {
  id: string
  module: string
  model: string
  cost_usd: number
  input_tokens?: number | null
  output_tokens?: number | null
  latency_ms?: number | null
  created_at: string
}

interface AttributionBucket { key: string; display: string; leads: number; converted: number; conversion_rate: number }
interface AttributionResp {
  window_days: number
  summary: { total_leads: number; total_converted: number; conversion_rate: number; attributed_leads: number; attribution_coverage: number }
  by_source: AttributionBucket[]
  by_medium: AttributionBucket[]
  by_campaign: AttributionBucket[]
  by_source_medium: AttributionBucket[]
}

const RANGES = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
] as const

export default function AnalyticsPage() {
  const { activeProject } = useProject()
  const supabase = createClient()

  const [metrics, setMetrics] = useState<CampaignMetric[]>([])
  const [aiCosts, setAiCosts] = useState<AICostEntry[]>([])
  const [attribution, setAttribution] = useState<AttributionResp | null>(null)
  const [range, setRange] = useState<typeof RANGES[number]['key']>('30d')

  useEffect(() => {
    if (activeProject) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, range])

  async function fetchData() {
    if (!activeProject) return
    const days = RANGES.find((r) => r.key === range)!.days
    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd')
    const endDate = format(new Date(), 'yyyy-MM-dd')

    const { data: campaigns } = await supabase.from('campaigns').select('id').eq('project_id', activeProject.id)
    const campaignIds = (campaigns ?? []).map((c: { id: string }) => c.id)

    if (campaignIds.length > 0) {
      const { data } = await supabase
        .from('campaign_metrics')
        .select('id, campaign_id, channel, date, impressions, clicks, conversions, spend, revenue')
        .in('campaign_id', campaignIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
      setMetrics((data as CampaignMetric[]) ?? [])
    } else {
      setMetrics([])
    }

    const { data: costsData } = await supabase
      .from('ai_cost_ledger')
      .select('id, module, model, cost_usd, input_tokens, output_tokens, latency_ms, created_at')
      .eq('project_id', activeProject.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setAiCosts((costsData as AICostEntry[]) ?? [])

    try {
      const res = await fetch(`/api/analytics/attribution?project_id=${activeProject.id}&days=${days}`)
      if (res.ok) setAttribution(await res.json())
      else setAttribution(null)
    } catch { setAttribution(null) }
  }

  const totals = useMemo(() => metrics.reduce(
    (acc, m) => ({
      impressions: acc.impressions + (m.impressions || 0),
      clicks: acc.clicks + (m.clicks || 0),
      conversions: acc.conversions + (m.conversions || 0),
      spend: acc.spend + (m.spend || 0),
    }),
    { impressions: 0, clicks: 0, conversions: 0, spend: 0 }
  ), [metrics])

  const derived = useMemo(() => {
    const { impressions, clicks, conversions, spend } = totals
    return {
      ctr: impressions > 0 ? clicks / impressions : null,
      convRate: clicks > 0 ? conversions / clicks : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpl: conversions > 0 ? spend / conversions : null,
    }
  }, [totals])

  const spendByChannel = useMemo(() => {
    const map: Record<string, number> = {}
    metrics.forEach((m) => { map[m.channel] = (map[m.channel] || 0) + (m.spend || 0) })
    const totalSpend = Object.values(map).reduce((a, b) => a + b, 0)
    return Object.entries(map).map(([channel, spend]) => ({ channel, spend: +spend.toFixed(2), pct: totalSpend ? (spend / totalSpend) * 100 : 0 }))
  }, [metrics])

  const dailyData = useMemo(() => {
    const map: Record<string, { date: string; impressions: number; clicks: number }> = {}
    metrics.forEach((m) => {
      if (!map[m.date]) map[m.date] = { date: m.date, impressions: 0, clicks: 0 }
      map[m.date].impressions += m.impressions || 0
      map[m.date].clicks += m.clicks || 0
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }, [metrics])

  function fmtNum(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return n.toLocaleString()
    return n.toLocaleString()
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Performance Overview"
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>
              Manual channel metrics from{' '}
              <Link href="/campaigns" className="text-emerald-400 hover:text-emerald-300">campaigns</Link>
              {' '}· AI spend from ledger · Lead attribution when available
            </span>
          </span>
        }
        actions={
          <div className="flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wider',
                  range === r.key ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {metrics.length === 0 && (
        <div className="mb-4 rounded-md border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-slate-300">
          No <code className="text-amber-200/90">campaign_metrics</code> rows in this window. Open a{' '}
          <Link href="/campaigns" className="text-emerald-400 hover:text-emerald-300">campaign</Link>
          {' '}and use <strong className="text-slate-200">Log metrics</strong> to populate charts.
        </div>
      )}

      {/* KPI totals from logged campaign_metrics only — no fabricated deltas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        {[
          { label: 'Impressions', value: fmtNum(totals.impressions) },
          { label: 'Clicks', value: fmtNum(totals.clicks) },
          { label: 'Conversions', value: fmtNum(totals.conversions) },
          { label: 'Spend (logged)', value: `$${totals.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
        ].map((k) => (
          <div key={k.label} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</span>
            <div className="mt-1 font-mono-data text-2xl font-semibold text-slate-100">{k.value}</div>
          </div>
        ))}
      </div>
      <p className="mb-4 text-[11px] text-slate-500">
        {(() => {
          const parts: string[] = []
          if (derived.ctr != null) parts.push(`CTR ${(derived.ctr * 100).toFixed(2)}%`)
          if (derived.convRate != null) parts.push(`Click→convert ${(derived.convRate * 100).toFixed(2)}%`)
          if (derived.cpc != null) parts.push(`CPC $${derived.cpc.toFixed(2)}`)
          if (derived.cpl != null) parts.push(`CPL $${derived.cpl.toFixed(2)}`)
          if (parts.length > 0) return parts.join(' · ')
          if (metrics.length > 0) return 'Add impressions, clicks, and spend across rows to compute rates.'
          return '—'
        })()}
      </p>

      {/* Chart row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <SectionPanel title="Spend by Channel">
          {spendByChannel.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No spend data for this period</p>
          ) : (
            <ul className="space-y-3">
              {spendByChannel.map((s) => (
                <li key={s.channel}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold uppercase tracking-wider text-slate-400">{s.channel}</span>
                    <span className="font-mono-data text-slate-300">${s.spend.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-emerald-400" style={{ width: `${s.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>

        <SectionPanel
          className="col-span-2"
          title="Daily impressions (logged)"
        >
          {dailyData.length === 0 ? (
            <p className="text-sm text-slate-500 py-12 text-center">No trend data for this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(d) => format(new Date(d), 'EEE').toUpperCase()} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', fontSize: '12px' }}
                  labelStyle={{ color: '#e2e8f0' }}
                  labelFormatter={(d) => format(new Date(d), 'MMM d, yyyy')}
                />
                <Bar dataKey="impressions" fill="#34d399" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionPanel>
      </div>

      {/* Attribution rollup */}
      {attribution && attribution.summary.total_leads > 0 && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Leads (window)', value: attribution.summary.total_leads.toLocaleString(), pct: 100, color: 'bg-emerald-400' },
              { label: 'Converted', value: attribution.summary.total_converted.toLocaleString(), pct: Math.round(attribution.summary.conversion_rate * 100), color: 'bg-cyan-400' },
              { label: 'Conversion Rate', value: `${(attribution.summary.conversion_rate * 100).toFixed(1)}%`, pct: Math.min(100, attribution.summary.conversion_rate * 100 * 5), color: 'bg-emerald-400' },
              { label: 'Attribution Coverage', value: `${(attribution.summary.attribution_coverage * 100).toFixed(0)}%`, pct: Math.round(attribution.summary.attribution_coverage * 100), color: 'bg-amber-400' },
            ].map((k) => (
              <div key={k.label} className="rounded-md border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</span>
                <div className="font-mono-data text-2xl font-semibold text-slate-100">{k.value}</div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full ${k.color}`} style={{ width: `${k.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <SectionPanel title="Top Sources">
              {attribution.by_source.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">No source data</p>
              ) : (
                <ul className="space-y-2">
                  {attribution.by_source.slice(0, 8).map((s) => (
                    <li key={s.key} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{s.display}</span>
                      <span className="flex items-center gap-3 font-mono-data">
                        <span className="text-slate-300">{s.leads}</span>
                        <span className={s.conversion_rate > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                          {(s.conversion_rate * 100).toFixed(0)}%
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionPanel>

            <SectionPanel title="Top Campaigns">
              {attribution.by_campaign.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">No campaign-attributed leads</p>
              ) : (
                <ul className="space-y-2">
                  {attribution.by_campaign.slice(0, 8).map((c) => (
                    <li key={c.key} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 truncate">{c.display}</span>
                      <span className="flex items-center gap-3 font-mono-data shrink-0">
                        <span className="text-slate-300">{c.leads}</span>
                        <span className={c.conversion_rate > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                          {(c.conversion_rate * 100).toFixed(0)}%
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionPanel>
          </div>

          <SectionPanel title="Source × Medium" contentClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="px-4 py-2.5 text-left">Source / Medium</th>
                    <th className="px-4 py-2.5 text-right">Leads</th>
                    <th className="px-4 py-2.5 text-right">Converted</th>
                    <th className="px-4 py-2.5 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {attribution.by_source_medium.slice(0, 12).map((row) => (
                    <tr key={row.key} className="hover:bg-slate-800/40">
                      <td className="px-4 py-2 font-semibold text-slate-100">{row.display}</td>
                      <td className="px-4 py-2 text-right font-mono-data text-slate-300">{row.leads}</td>
                      <td className="px-4 py-2 text-right font-mono-data text-slate-300">{row.converted}</td>
                      <td className="px-4 py-2 text-right">
                        <StatusPill tone={row.conversion_rate >= 0.1 ? 'success' : row.conversion_rate > 0 ? 'warn' : 'neutral'}>
                          {(row.conversion_rate * 100).toFixed(1)}%
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                  {attribution.by_source_medium.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No attributed leads in this window</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionPanel>

          <div className="h-4" />
        </>
      )}

      {/* AI cost — real ledger rows only */}
      <SectionPanel title="AI cost (recent)" contentClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 text-left">Time</th>
                <th className="px-4 py-2.5 text-left">Module</th>
                <th className="px-4 py-2.5 text-left">Model</th>
                <th className="px-4 py-2.5 text-right">Tokens</th>
                <th className="px-4 py-2.5 text-right">Latency</th>
                <th className="px-4 py-2.5 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {aiCosts.slice(0, 20).map((c) => {
                const tok = (c.input_tokens ?? 0) + (c.output_tokens ?? 0)
                return (
                  <tr key={c.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono-data text-slate-500">{format(new Date(c.created_at), 'MMM d HH:mm')}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-100">{c.module}</td>
                    <td className="px-4 py-2.5 text-slate-400">{c.model}</td>
                    <td className="px-4 py-2.5 text-right font-mono-data text-slate-300">{tok > 0 ? fmtNum(tok) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono-data text-slate-300">{c.latency_ms ? `${(c.latency_ms / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono-data text-emerald-400">${c.cost_usd.toFixed(4)}</td>
                  </tr>
                )
              })}
              {aiCosts.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No AI cost rows yet for this project.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </PageShell>
  )
}
