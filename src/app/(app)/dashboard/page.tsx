'use client'

import { useEffect, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { StatCard } from '@/components/ui/stat-card'
import { StatusPill } from '@/components/ui/status-pill'
import { SectionPanel } from '@/components/ui/section-panel'
import { Sparkline } from '@/components/ui/sparkline'
import { Plus, Zap, Upload, Sparkles, Megaphone, AlertTriangle, Users } from 'lucide-react'
import { AllProjectsGrid } from '@/components/dashboard/all-projects-grid'

interface Stats {
  activeCampaigns: number
  adsGenerated: number
  leads: number
  totalSpend: number
}

const DEMO_SPARK = () => Array.from({ length: 12 }, () => Math.random() * 100)

const INTEGRATIONS = [
  { name: 'Google Ads API', tone: 'success' as const, tag: 'V14.1_OK' },
  { name: 'Meta Graph', tone: 'success' as const, tag: 'LIVE' },
  { name: 'TikTok Pixel', tone: 'error' as const, tag: 'REAUTH' },
  { name: 'SendGrid SMTP', tone: 'success' as const, tag: '99.5%' },
]

const SHORTCUTS = [
  { label: 'Launch Analytics', keys: 'G + A' },
  { label: 'Generate Ad Copy', keys: 'CMD + J' },
  { label: 'Sync Data Sources', keys: 'ALT + S' },
]

export default function DashboardPage() {
  const { activeProject, projects, loading } = useProject()
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<Stats>({ activeCampaigns: 0, adsGenerated: 0, leads: 0, totalSpend: 0 })
  const [activity, setActivity] = useState<Array<{ id: string; title: string; desc: string; tone: 'success' | 'warn' | 'info' | 'accent'; tags: string[]; time: string; icon: typeof Megaphone }>>([])

  useEffect(() => {
    if (activeProject) fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  async function fetchStats() {
    if (!activeProject) return
    const [campaigns, ads, leads, costs] = await Promise.all([
      supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('project_id', activeProject.id).eq('status', 'active'),
      supabase.from('ad_copies').select('id, ad_briefs!inner(project_id)', { count: 'exact', head: true }).eq('ad_briefs.project_id', activeProject.id),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('project_id', activeProject.id),
      supabase.from('ai_cost_ledger').select('cost_usd').eq('project_id', activeProject.id),
    ])
    const totalCost = (costs.data as { cost_usd: number | null }[] ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)
    setStats({
      activeCampaigns: campaigns.count ?? 0,
      adsGenerated: ads.count ?? 0,
      leads: leads.count ?? 0,
      totalSpend: Math.round(totalCost * 100) / 100,
    })
    // Placeholder activity — replace with real event log when available
    setActivity([
      { id: '1', icon: Megaphone, title: 'Campaign Launched', desc: 'Automated distribution completed across 4 channels. Initial CPM verified at $4.12.', tone: 'success', tags: ['SUCCESS', 'SYSTEM_AUTO'], time: '14:22:10' },
      { id: '2', icon: Sparkles, title: 'AI Content Batch Generated', desc: '32 variants created for A/B testing on Lead Magnets. High predicted CTR of 6.2%.', tone: 'info', tags: ['AI_ENHANCED', 'BATCH_PROCESSING'], time: '12:05:44' },
      { id: '3', icon: AlertTriangle, title: 'Pixel Tracking Discontinuity', desc: 'Meta Ads Pixel reporting 12% signal loss on iOS devices. Investigation required.', tone: 'warn', tags: ['WARNING', 'MANUAL_ACTION'], time: '09:15:22' },
      { id: '4', icon: Users, title: 'High Value Lead Identified', desc: 'User UUID_8842 matched enterprise profile criteria. Forwarded to Lead Handler.', tone: 'accent', tags: ['CONVERSION', 'PRIORITY'], time: '08:44:01' },
    ])
  }

  if (loading) {
    return (
      <PageShell>
        <div className="space-y-6 animate-pulse">
          <div className="h-16 rounded-md bg-slate-800/60" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-28 rounded-md bg-slate-800/60" />)}
          </div>
        </div>
      </PageShell>
    )
  }

  if (projects.length === 0) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md rounded-md border border-slate-800 bg-slate-900/60 p-8 text-center">
            <h1 className="text-2xl font-semibold text-slate-100">Welcome to GrowthOS</h1>
            <p className="mt-2 text-sm text-slate-400">Create your first project to start managing marketing across all channels.</p>
            <button
              onClick={() => router.push('/projects')}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Create your first project
            </button>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {/* Status bar */}
      <div className="mb-6 flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center gap-2 px-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Active Status</span>
          <span className="flex items-center gap-1.5 text-xs font-mono-data text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            SYSTEM_READY
          </span>
        </div>
        <div className="flex-1" />
        <Link href="/campaigns" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
          <Plus className="h-3.5 w-3.5" /> New Campaign
        </Link>
        <Link href="/ad-studio/generate" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
          <Zap className="h-3.5 w-3.5" /> Quick Generate
        </Link>
        <Link href="/leads" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
          <Upload className="h-3.5 w-3.5" /> Import Leads
        </Link>
        <StatusPill tone="success">
          <Sparkles className="h-3 w-3" /> AI Engine Active
        </StatusPill>
      </div>

      {/* All projects at a glance */}
      <div className="mb-6">
        <AllProjectsGrid />
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Reach" value="1.28M" delta="+12.4%" trend="up" sparkline={<Sparkline data={DEMO_SPARK()} />} />
        <StatCard label="Conversion Rate" value="4.82%" delta="+0.8%" trend="up" sparkline={<Sparkline data={DEMO_SPARK()} />} />
        <StatCard label="Avg CPC" value="$0.42" delta="-2.1%" trend="down" sparkline={<Sparkline data={DEMO_SPARK()} color="#f43f5e" />} />
        <StatCard label="Ad Spend" value={`$${(stats.totalSpend / 1000).toFixed(1)}K`} delta="Stable" trend="flat" sparkline={<Sparkline data={DEMO_SPARK()} color="#94a3b8" />} />
        <StatCard label="Email CTR" value="18.5%" delta="+4.2%" trend="up" sparkline={<Sparkline data={DEMO_SPARK()} />} />
        <StatCard label="Lead Velocity" value={`${stats.leads}/hr`} delta="+18.0%" trend="up" sparkline={<Sparkline data={DEMO_SPARK()} />} />
        <StatCard label="SQL Pipeline" value="$428K" delta="+$22K" trend="up" sparkline={<Sparkline data={DEMO_SPARK()} />} />
        <StatCard label="CAC Recovery" value="4.2mo" delta="Slowdown" trend="down" sparkline={<Sparkline data={DEMO_SPARK()} color="#f43f5e" />} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        <SectionPanel
          className="col-span-2"
          title="System Logs / Recent Activity"
          action={<Link href="#" className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:text-emerald-300">View Archive →</Link>}
        >
          <ul className="divide-y divide-slate-800">
            {activity.map((a) => {
              const Icon = a.icon
              return (
                <li key={a.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    a.tone === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                    a.tone === 'warn' ? 'bg-amber-500/10 text-amber-400' :
                    a.tone === 'accent' ? 'bg-emerald-500 text-slate-950' :
                    'bg-cyan-500/10 text-cyan-400'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{a.title}</h3>
                      <span className="text-[10px] font-mono-data text-slate-500 shrink-0">{a.time}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{a.desc}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {a.tags.map((t) => <StatusPill key={t} tone={a.tone}>{t}</StatusPill>)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </SectionPanel>

        <div className="flex flex-col gap-4">
          <SectionPanel title="Integrations Status">
            <ul className="space-y-2">
              {INTEGRATIONS.map((i) => (
                <li key={i.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-300">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      i.tone === 'success' ? 'bg-emerald-400' : 'bg-rose-400'
                    }`} />
                    {i.name}
                  </span>
                  <span className="font-mono-data text-[10px] text-slate-500">{i.tag}</span>
                </li>
              ))}
            </ul>
          </SectionPanel>

          <SectionPanel title="Monthly Forecast">
            <div className="mb-2 font-mono-data text-xl font-semibold text-slate-100">$482,900.00</div>
            <Sparkline data={[30, 45, 35, 60, 50, 80, 95, 65, 55, 40]} className="h-10" />
          </SectionPanel>

          <SectionPanel title="Operator Shortcuts" className="border-emerald-500/40">
            <ul className="space-y-2">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{s.label}</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono-data text-[10px] text-slate-400">{s.keys}</kbd>
                </li>
              ))}
            </ul>
          </SectionPanel>
        </div>
      </div>
    </PageShell>
  )
}
