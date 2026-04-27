'use client'

import { useEffect, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { StatCard } from '@/components/ui/stat-card'
import { SectionPanel } from '@/components/ui/section-panel'
import { Sparkline } from '@/components/ui/sparkline'
import { Plus, Zap, Upload, Sparkles, Megaphone, AlertTriangle, CheckCircle2, FileText, Send, Globe, Activity } from 'lucide-react'
import { AllProjectsGrid } from '@/components/dashboard/all-projects-grid'
import type { IntegrationHealth, DashboardActivity } from '@/app/api/dashboard/health/route'

interface KpiData {
  activeCampaigns: number
  adsGenerated: number
  leads: number
  totalSpend: number
  leadsThisWeek: number
  webhookSuccessRate: number | null
  recentIngestStatus: 'ok' | 'failing' | 'unknown'
  spendDaily: number[]
  leadsDaily: number[]
}

const ACTIVITY_ICON = {
  ingest: Globe,
  ad: FileText,
  social: Send,
  webhook: Activity,
} as const

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

export default function DashboardPage() {
  const { activeProject, projects, loading } = useProject()
  const router = useRouter()
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [activity, setActivity] = useState<DashboardActivity[]>([])
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([])
  // Initial true so the first render shows skeletons; flips to false when
  // the fetch resolves (no synchronous setState inside the effect body).
  const [healthLoading, setHealthLoading] = useState(true)

  useEffect(() => {
    if (!activeProject) return
    const ctrl = new AbortController()
    fetch(`/api/dashboard/health?project_id=${activeProject.id}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        setKpi(j.kpi)
        setActivity(j.activity ?? [])
        setIntegrations(j.integrations ?? [])
        setHealthLoading(false)
      })
      .catch(() => setHealthLoading(false))
    return () => ctrl.abort()
  }, [activeProject?.id])

  if (loading) {
    return (
      <PageShell>
        <div className="space-y-6 animate-pulse">
          <div className="h-16 rounded-md bg-slate-800/60" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-md bg-slate-800/60" />)}
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
            <p className="mt-2 text-sm text-slate-400">Create your first project to start generating ads, posts, emails, and more.</p>
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
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Active Project</span>
          <span className="flex items-center gap-1.5 text-xs font-mono-data text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {activeProject?.name ?? '—'}
          </span>
        </div>
        <div className="flex-1" />
        <Link href="/campaigns" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
          <Plus className="h-3.5 w-3.5" /> New Campaign
        </Link>
        <Link href="/ad-studio/generate" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
          <Zap className="h-3.5 w-3.5" /> Generate Ad
        </Link>
        <Link href="/leads" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
          <Upload className="h-3.5 w-3.5" /> View Leads
        </Link>
      </div>

      {/* All projects at a glance */}
      <div className="mb-6">
        <AllProjectsGrid />
      </div>

      {/* Real KPI grid — only metrics we actually track. */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Active Campaigns"
          value={kpi ? String(kpi.activeCampaigns) : '—'}
        />
        <StatCard
          label="Leads (7d)"
          value={kpi ? String(kpi.leadsThisWeek) : '—'}
          delta={kpi && kpi.leads > 0 ? `${kpi.leads} total` : undefined}
          sparkline={kpi && kpi.leadsDaily.some((v) => v > 0) ? <Sparkline data={kpi.leadsDaily} /> : undefined}
        />
        <StatCard
          label="Ads Generated"
          value={kpi ? String(kpi.adsGenerated) : '—'}
          delta={kpi && kpi.adsGenerated > 0 ? 'lifetime' : undefined}
        />
        <StatCard
          label="AI Spend (14d)"
          value={kpi ? `$${kpi.totalSpend.toFixed(2)}` : '—'}
          sparkline={kpi && kpi.spendDaily.some((v) => v > 0) ? <Sparkline data={kpi.spendDaily} color="#94a3b8" /> : undefined}
        />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        <SectionPanel
          className="col-span-2"
          title="Recent Activity"
          action={<Link href="/observability" className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:text-emerald-300">Observability →</Link>}
        >
          {healthLoading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Sparkles className="h-8 w-8 text-slate-600 mb-2" />
              <p className="text-sm text-slate-400">No activity yet. Generate an ad or sync a project to get started.</p>
              <Link href="/ad-studio/generate" className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
                Generate first ad →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {activity.map((a) => {
                const Icon = ACTIVITY_ICON[a.type] ?? Megaphone
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
                        <span className="text-[10px] font-mono-data text-slate-500 shrink-0">{relativeTime(a.time)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400 break-words">{a.desc}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionPanel>

        <div className="flex flex-col gap-4">
          <SectionPanel title="Integrations">
            {healthLoading && integrations.length === 0 ? (
              <p className="text-xs text-slate-500">Checking…</p>
            ) : (
              <ul className="space-y-2">
                {integrations.map((i) => {
                  const dotClass =
                    i.status === 'ok' ? 'bg-emerald-400' :
                    i.status === 'warn' ? 'bg-amber-400' :
                    i.status === 'error' ? 'bg-rose-400' :
                    'bg-slate-600'
                  return (
                    <li key={i.name} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-300">
                          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                          {i.name}
                        </span>
                        <span className="font-mono-data text-[10px] text-slate-500">
                          {i.status === 'optional' && !i.configured ? 'optional' : i.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-3.5 mt-0.5 text-[10px] text-slate-500">{i.detail}</div>
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionPanel>

          <SectionPanel title="System Health">
            <ul className="space-y-2 text-xs">
              <li className="flex items-center justify-between">
                <span className="text-slate-300">Site sync</span>
                <span className={`flex items-center gap-1 font-mono-data text-[10px] ${
                  kpi?.recentIngestStatus === 'ok' ? 'text-emerald-300' :
                  kpi?.recentIngestStatus === 'failing' ? 'text-rose-300' : 'text-slate-500'
                }`}>
                  {kpi?.recentIngestStatus === 'ok' && <CheckCircle2 className="h-3 w-3" />}
                  {kpi?.recentIngestStatus === 'failing' && <AlertTriangle className="h-3 w-3" />}
                  {kpi?.recentIngestStatus === 'ok' ? 'OK' : kpi?.recentIngestStatus === 'failing' ? 'FAILING' : 'NO RECENT'}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-slate-300">Webhook delivery (7d)</span>
                <span className="font-mono-data text-[10px] text-slate-300">
                  {kpi?.webhookSuccessRate == null ? '—' : `${(kpi.webhookSuccessRate * 100).toFixed(0)}%`}
                </span>
              </li>
            </ul>
          </SectionPanel>
        </div>
      </div>
    </PageShell>
  )
}
