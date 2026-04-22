'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import {
  Briefcase, Rocket, Palette, Target, Users, Megaphone, Mail, FileText, Search,
  BarChart3, FlaskConical, Zap, Loader2, Calendar, ArrowRight, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BrandVoice {
  guidelines?: Record<string, unknown>
  competitive_intel?: Record<string, unknown>
  current_sprint?: Record<string, unknown>
  [k: string]: unknown
}

export default function AgencyHomePage() {
  const { activeProject } = useProject()
  const supabase = createClient()
  const [bv, setBv] = useState<BrandVoice>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function refresh() {
    if (!activeProject) return
    const { data } = await supabase.from('projects').select('brand_voice').eq('id', activeProject.id).single()
    setBv(((data?.brand_voice as BrandVoice) ?? {}))
  }

  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProject?.id])

  async function callAgent(endpoint: string, body: Record<string, unknown>, label: string) {
    if (!activeProject) return
    setBusy(label)
    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, ...body }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      toast.success(`${label} complete`)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setBusy(null)
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  const sprint = bv.current_sprint as Record<string, unknown> | undefined
  const guidelines = bv.guidelines as Record<string, unknown> | undefined
  const intel = bv.competitive_intel as Record<string, unknown> | undefined
  const classification = bv.classification as { vertical?: string; business_model?: string; stage?: string; vertical_confidence?: number } | undefined

  const departments = [
    { key: 'brief', label: 'Daily Brief', icon: Calendar, href: '/agency/daily-brief', desc: 'One screen across all your products — drafts, sprint, quick actions', color: 'text-emerald-200' },
    { key: 'voice', label: 'Founder Voice', icon: Sparkles, href: '/agency/voice', desc: 'Train AI on your tweets + save winning assets as style references', color: 'text-yellow-300' },
    { key: 'market-intel', label: 'Market Intelligence', icon: Search, href: '/agency/market-intel', desc: 'Live Reddit + HN scan → trending themes, pains, gaps, content hooks', color: 'text-emerald-400' },
    { key: 'launch', label: 'Launch Campaign', icon: Rocket, href: '/launch', desc: 'Full multi-channel drop with agent chain', color: 'text-emerald-400' },
    { key: 'optimize', label: 'Optimization Suite', icon: FlaskConical, href: '/agency/optimize', desc: 'On-page, internal links, AEO, LP audit, A/B', color: 'text-emerald-300' },
    { key: 'sales', label: 'Sales Outbound', icon: Target, href: '/agency/sales', desc: 'Cold email, LinkedIn DMs, battle cards, discovery, demos, ROI, ICP', color: 'text-sky-400' },
    { key: 'lifecycle', label: 'Email Lifecycle', icon: Mail, href: '/agency/lifecycle', desc: 'Full vertical-aware lifecycle flows — onboarding to winback', color: 'text-amber-400' },
    { key: 'launch-kit', label: 'Launch Library', icon: Rocket, href: '/agency/launch-kit', desc: 'Product Hunt, Show HN, Indie Hackers, BetaList kits + master plan', color: 'text-pink-400' },
    { key: 'pr', label: 'PR / Media Suite', icon: Briefcase, href: '/agency/pr', desc: 'Press kit, releases, pitches, HARO, podcast/speaking/awards, newsjacking', color: 'text-indigo-400' },
    { key: 'positioning', label: 'Positioning Studio', icon: Target, href: '/agency/positioning', desc: 'JTBD, messaging house, market sizing, category design, value ladder', color: 'text-purple-300' },
    { key: 'retention', label: 'Retention Tools', icon: FlaskConical, href: '/agency/retention', desc: 'Cohort, churn prediction, reactivation, NPS, customer health', color: 'text-teal-300' },
    { key: 'growth-loops', label: 'Growth Loops', icon: Users, href: '/agency/growth-loops', desc: 'Referral, affiliate, community, UGC, ambassador programs', color: 'text-pink-300' },
    { key: 'creative-lab', label: 'Creative Lab', icon: FileText, href: '/agency/creative-lab', desc: 'Creative briefs, testing matrix, video scripts, LP wireframes, ad packs', color: 'text-orange-300' },
    { key: 'pseo', label: 'Programmatic SEO', icon: BarChart3, href: '/agency/programmatic-seo', desc: 'One template → 20-100 pages with internal linking', color: 'text-lime-300' },
    { key: 'brand', label: 'Brand Hub', icon: Palette, href: '/agency/brand', desc: 'Voice, messaging, style guide, taglines', color: 'text-purple-400' },
    { key: 'strategy', label: 'Strategy', icon: Target, href: '/agency/strategy', desc: 'CMO briefs, positioning, quarterly plan', color: 'text-cyan-400' },
    { key: 'intel', label: 'Competitive Intel', icon: Search, href: '/agency/intel', desc: 'Competitor analysis, positioning gaps', color: 'text-orange-400' },
    { key: 'seo', label: 'SEO Command Center', icon: BarChart3, href: '/agency/seo', desc: 'Keywords, clusters, comparison pages', color: 'text-lime-400' },
    { key: 'seo-audit', label: 'SEO Audit (Crawl)', icon: Search, href: '/agency/seo-audit', desc: 'Real technical crawl — titles, metas, H1, schema, alt, HTTPS', color: 'text-yellow-400' },
    { key: 'paid', label: 'Paid Media', icon: Megaphone, href: '/ad-studio', desc: 'Meta, LinkedIn, TikTok ad creation & review', color: 'text-blue-400' },
    { key: 'content', label: 'Content', icon: FileText, href: '/content', desc: 'Blog, editorial calendar, repurposing', color: 'text-teal-400' },
    { key: 'social', label: 'Social', icon: Users, href: '/social', desc: 'Calendars for each platform', color: 'text-pink-400' },
    { key: 'email', label: 'Email Lifecycle', icon: Mail, href: '/email', desc: 'Welcome, activation, retention, win-back', color: 'text-amber-400' },
    { key: 'experiments', label: 'Experiments', icon: FlaskConical, href: '/agency/experiments', desc: 'A/B tests, CRO, growth loops', color: 'text-rose-400' },
    { key: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics', desc: 'Weekly/monthly/quarterly reports', color: 'text-indigo-400' },
    { key: 'leads', label: 'Leads & CRM', icon: Briefcase, href: '/leads', desc: 'Pipeline, capture, landing pages', color: 'text-emerald-300' },
  ]

  return (
    <PageShell>
      {/* Agency header */}
      <div className="mb-6 relative overflow-hidden rounded-md border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-slate-900 to-slate-900 p-6">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
          backgroundImage: 'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1.5 font-mono-data text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AGENCY · ACTIVE
              </span>
              <span className="font-mono-data text-[10px] text-slate-500">CLIENT: {activeProject.name}</span>
              {classification?.vertical && (
                <StatusPill tone="accent">{classification.vertical.replace(/_/g, ' ')}</StatusPill>
              )}
              {classification?.business_model && (
                <StatusPill tone="neutral">{classification.business_model.replace(/_/g, ' ')}</StatusPill>
              )}
              {classification?.stage && (
                <StatusPill tone="info">{classification.stage.replace(/_/g, ' ')}</StatusPill>
              )}
            </div>
            <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Your Marketing Agency</h1>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              A full marketing team in a box. CMO, SEO, copywriters, media buyers, analysts — all AI agents coordinated to ship deliverables every week. Zero humans to hire.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => callAgent('/api/agency/brand', {}, 'Brand guidelines')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-md border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-300 hover:bg-purple-500/20 disabled:opacity-50"
            >
              {busy === 'Brand guidelines' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Palette className="h-3.5 w-3.5" />}
              {guidelines ? 'Regenerate Brand Book' : 'Generate Brand Book'}
            </button>
            <button
              onClick={() => callAgent('/api/agency/sprint', {}, 'Weekly sprint')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy === 'Weekly sprint' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
              Generate This Week&apos;s Sprint
            </button>
          </div>
        </div>
      </div>

      {/* Status tiles */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatTile label="Brand Book" value={guidelines ? 'Ready' : 'Not Set'} tone={guidelines ? 'success' : 'neutral'} />
        <StatTile label="Competitive Intel" value={intel ? 'Analyzed' : 'Not Run'} tone={intel ? 'success' : 'neutral'} />
        <StatTile label="Current Sprint" value={sprint ? `Week of ${(sprint.week_start as string) ?? 'now'}` : 'Not Set'} tone={sprint ? 'success' : 'neutral'} />
        <StatTile label="Launch Status" value="Run any time" tone="accent" />
      </div>

      {/* This week's sprint */}
      {sprint && (
        <SectionPanel
          className="mb-6 border-emerald-500/30"
          title={<span className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-emerald-400" />This Week&apos;s Sprint · {sprint.sprint_theme as string}</span>}
          action={<StatusPill tone="accent">North Star: {sprint.north_star as string}</StatusPill>}
        >
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
              const deliverables = ((sprint.deliverables as Array<Record<string, unknown>> | undefined) ?? [])
                .filter((d) => d.day === day)
              return (
                <div key={day} className="rounded-md border border-slate-800 bg-slate-900/40 p-2 min-h-[140px]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{day}</div>
                  <div className="space-y-1">
                    {deliverables.map((d, i) => (
                      <div key={i} className="rounded bg-slate-800 p-1.5 text-[10px]">
                        <div className="font-semibold text-slate-200 line-clamp-2">{d.title as string}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[9px] font-mono-data text-slate-500">
                          <span>{d.time as string}</span>
                          <span>·</span>
                          <span className="text-emerald-400">{(d.channel as string)?.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {Array.isArray(sprint.experiments_to_run) && (sprint.experiments_to_run as Array<Record<string, unknown>>).length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Experiments This Week</span>
              <ul className="mt-2 space-y-2">
                {(sprint.experiments_to_run as Array<Record<string, unknown>>).map((e, i) => (
                  <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                    <div className="text-xs font-semibold text-slate-100">{e.name as string}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{e.hypothesis as string}</div>
                    <div className="mt-1 flex gap-2 text-[10px] font-mono-data text-slate-500">
                      <span>A: {e.variant_a as string}</span>
                      <span>vs</span>
                      <span>B: {e.variant_b as string}</span>
                      <span>· {e.duration_days as number}d</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionPanel>
      )}

      {/* Departments grid */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Departments</h2>
        <div className="grid grid-cols-4 gap-3">
          {departments.map((d) => {
            const Icon = d.icon
            return (
              <Link
                key={d.key}
                href={d.href}
                className="group relative rounded-md border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-500/40 hover:bg-slate-900/80 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-md bg-slate-800', d.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="text-sm font-semibold text-slate-100">{d.label}</h3>
                <p className="mt-1 text-xs text-slate-400">{d.desc}</p>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Quick start */}
      {!guidelines && (
        <SectionPanel className="border-emerald-500/20 bg-emerald-500/5" title={<span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-emerald-400" />Quick Start</span>}>
          <ol className="space-y-2 text-sm text-slate-200">
            <li>1. Click <strong>Generate Brand Book</strong> above — every other agent uses this as the source of truth</li>
            <li>2. Go to <strong>Competitive Intel</strong>, paste 3 competitor URLs</li>
            <li>3. Click <strong>Generate This Week&apos;s Sprint</strong> to get 12-20 deliverables scheduled</li>
            <li>4. Hit <strong>Launch Campaign</strong> when ready for the multi-channel drop</li>
          </ol>
        </SectionPanel>
      )}
    </PageShell>
  )
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warn' | 'neutral' | 'accent' }) {
  const toneClass = {
    success: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    warn: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    neutral: 'border-slate-800 bg-slate-900/40 text-slate-400',
    accent: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  }[tone]
  return (
    <div className={cn('rounded-md border p-3', toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  )
}
