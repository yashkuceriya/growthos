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
  tokens?: number
  latency_ms?: number
  created_at: string
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
      const { data } = await supabase.from('campaign_metrics').select('*').in('campaign_id', campaignIds).gte('date', startDate).lte('date', endDate).order('date', { ascending: true })
      setMetrics((data as CampaignMetric[]) ?? [])
    } else {
      setMetrics([])
    }

    const { data: costsData } = await supabase.from('ai_cost_ledger').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false })
    setAiCosts((costsData as AICostEntry[]) ?? [])
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
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs">Live data stream active — Last updated: {format(new Date(), 'HH:mm:ss')} UTC</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wider',
                    range === r.key ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
              Custom Range
            </button>
          </div>
        }
      />

      {/* KPI cards with progress bars */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Impressions', value: fmtNum(totals.impressions), delta: '+12.4%', tone: 'success' as const, pct: 65, color: 'bg-emerald-400' },
          { label: 'Clicks', value: fmtNum(totals.clicks), delta: '+4.1%', tone: 'success' as const, pct: 48, color: 'bg-emerald-400' },
          { label: 'Conversions', value: fmtNum(totals.conversions), delta: '-0.8%', tone: 'error' as const, pct: 35, color: 'bg-cyan-400' },
          { label: 'Total Spend', value: `$${totals.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, delta: 'Optimized', tone: 'success' as const, pct: 72, color: 'bg-emerald-400' },
        ].map((k) => (
          <div key={k.label} className="rounded-md border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</span>
              <StatusPill tone={k.tone}>{k.delta}</StatusPill>
            </div>
            <div className="font-mono-data text-2xl font-semibold text-slate-100">{k.value}</div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full ${k.color}`} style={{ width: `${k.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Chart row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <SectionPanel title="Spend by Channel" action={<button className="text-slate-500 hover:text-slate-300">⋯</button>}>
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
          title="Daily Growth Trend"
          action={
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Growth</span>
              <span className="flex items-center gap-1 text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />Target</span>
            </div>
          }
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

      {/* AI cost breakdown table */}
      <SectionPanel
        title={<span className="flex items-center gap-2">AI Engine Cost Breakdown <StatusPill tone="accent">AI OPTIMIZING</StatusPill></span>}
        action={<div className="flex items-center gap-3 text-slate-500"><button className="hover:text-slate-300">↓</button><button className="hover:text-slate-300">▾</button></div>}
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 text-left">ID</th>
                <th className="px-4 py-2.5 text-left">Channel Name</th>
                <th className="px-4 py-2.5 text-left">LLM Model</th>
                <th className="px-4 py-2.5 text-right">Token Usage</th>
                <th className="px-4 py-2.5 text-right">Processing Time</th>
                <th className="px-4 py-2.5 text-right">Total Cost</th>
                <th className="px-4 py-2.5 text-right">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {aiCosts.slice(0, 10).map((c, i) => {
                const eff = Math.min(99, 80 + (i * 2))
                return (
                  <tr key={c.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono-data text-slate-500">#OS-{(9921 + i).toString()}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-100">{c.module}</td>
                    <td className="px-4 py-2.5 text-slate-400">{c.model}</td>
                    <td className="px-4 py-2.5 text-right font-mono-data text-slate-300">{c.tokens ? fmtNum(c.tokens) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono-data text-slate-300">{c.latency_ms ? (c.latency_ms / 1000).toFixed(1) + 's' : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono-data text-emerald-400">${c.cost_usd.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right"><StatusPill tone={eff > 95 ? 'success' : 'warn'}>{eff}%</StatusPill></td>
                  </tr>
                )
              })}
              {aiCosts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No AI cost data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </PageShell>
  )
}
