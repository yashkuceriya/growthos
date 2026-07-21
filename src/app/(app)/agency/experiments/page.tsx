'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
  FlaskConical,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { LOCAL_DEV_PROJECT_ID } from '@/lib/local-dev-auth'
import {
  buildExperimentBrief,
  buildExperimentPortfolio,
  summarizeExperimentPortfolio,
  type ExperimentReadiness,
  type MarketingExperiment,
} from '@/lib/marketing/experiments'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill, type StatusTone } from '@/components/ui/status-pill'
import { cn } from '@/lib/utils'

interface CampaignSignal {
  id: string
  name: string
  status: string
  updated_at: string
}

export default function ExperimentsPage() {
  const { activeProject } = useProject()
  const supabase = useMemo(() => createClient(), [])
  const [brandVoice, setBrandVoice] = useState<Record<string, unknown>>({})
  const [campaigns, setCampaigns] = useState<CampaignSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const refresh = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    const localBrandVoice = object(activeProject.brand_voice)
    setBrandVoice(localBrandVoice)
    if (activeProject.id === LOCAL_DEV_PROJECT_ID) {
      setCampaigns([])
      setLoading(false)
      return
    }

    try {
      const [projectResult, campaignResult] = await Promise.all([
        supabase.from('projects').select('brand_voice').eq('id', activeProject.id).maybeSingle(),
        supabase
          .from('campaigns')
          .select('id, name, status, updated_at')
          .eq('project_id', activeProject.id)
          .order('updated_at', { ascending: false })
          .limit(6),
      ])
      if (projectResult.data?.brand_voice) setBrandVoice(object(projectResult.data.brand_voice))
      if (campaignResult.data) setCampaigns(campaignResult.data as CampaignSignal[])
    } finally {
      setLoading(false)
    }
  }, [activeProject, supabase])

  useEffect(() => { void refresh() }, [refresh])

  const sprint = object(brandVoice.current_sprint)
  const experiments = useMemo(
    () => buildExperimentPortfolio(sprint.experiments_to_run),
    [sprint.experiments_to_run],
  )
  const summary = useMemo(() => summarizeExperimentPortfolio(experiments), [experiments])
  const northStar = text(sprint.north_star)
  const sprintTheme = text(sprint.sprint_theme)

  async function generateSprint() {
    if (!activeProject) return
    setGenerating(true)
    try {
      const response = await fetch('/api/agency/sprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not generate sprint')
      toast.success('Decision-grade sprint generated')
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate sprint')
    } finally {
      setGenerating(false)
    }
  }

  async function copyBrief(experiment: MarketingExperiment) {
    const brief = buildExperimentBrief(experiment, {
      projectName: activeProject?.name,
      northStar,
      sprintTheme,
    })
    await navigator.clipboard.writeText(brief)
    toast.success('Experiment brief copied')
  }

  if (!activeProject) {
    return <PageShell><p className="text-sm text-slate-400">Select a project to plan experiments.</p></PageShell>
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumb={<Link href="/agency" className="hover:text-emerald-300">Agency / Experiments</Link>}
        title="Experiment Command Center"
        subtitle="Turn sprint ideas into precommitted decisions, then feed the evidence back into campaigns and agents."
        actions={
          <>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              title="Refresh experiment data"
              aria-label="Refresh experiment data"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            <Link
              href="/agency/optimize"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate ideas
            </Link>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 border-y border-slate-800 md:grid-cols-4">
        <Stat label="Sprint experiments" value={String(summary.total)} />
        <Stat label="Run-ready" value={String(summary.ready)} tone={summary.ready > 0 ? 'text-emerald-300' : undefined} />
        <Stat label="Average readiness" value={`${summary.averageScore}%`} />
        <Stat label="Campaign evidence" value={String(campaigns.length)} />
      </div>

      {experiments.length === 0 ? (
        <EmptyExperiments loading={loading} generating={generating} onGenerate={() => void generateSprint()} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <SectionPanel
            title={<span className="flex items-center gap-2"><FlaskConical className="h-3.5 w-3.5 text-emerald-300" />Current decision queue</span>}
            action={northStar ? <StatusPill tone="accent">North star: {northStar}</StatusPill> : undefined}
            contentClassName="p-0"
          >
            <div className="divide-y divide-slate-800">
              {experiments.map((experiment, index) => (
                <ExperimentRow
                  key={experiment.id}
                  experiment={experiment}
                  rank={index + 1}
                  onCopy={() => void copyBrief(experiment)}
                />
              ))}
            </div>
          </SectionPanel>

          <div className="space-y-5">
            <SectionPanel title="Operating protocol">
              <ol className="space-y-3 text-xs leading-5 text-slate-300">
                <ProtocolStep number="1" title="Define" detail="Change one variable and precommit the decision rule." />
                <ProtocolStep number="2" title="Run" detail="Keep the control stable for the planned duration." />
                <ProtocolStep number="3" title="Read" detail="Judge the primary metric and check the guardrail." />
                <ProtocolStep number="4" title="Learn" detail="Promote, iterate, or stop, then preserve the evidence." />
              </ol>
              <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-4 text-slate-500">
                Readiness measures design completeness. Confidence still comes from observed results and sufficient traffic.
              </p>
            </SectionPanel>

            <SectionPanel
              title={<span className="flex items-center gap-2"><History className="h-3.5 w-3.5 text-cyan-300" />Recent campaign evidence</span>}
              contentClassName="p-0"
            >
              {campaigns.length ? (
                <div className="divide-y divide-slate-800">
                  {campaigns.map((campaign) => (
                    <Link
                      key={campaign.id}
                      href={`/campaigns/${campaign.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-200">{campaign.name}</div>
                        <div className="mt-1 text-[10px] text-slate-500">Updated {formatDate(campaign.updated_at)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={campaign.status}>{campaign.status}</StatusPill>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-xs leading-5 text-slate-500">
                  Campaign results will appear here after the first launch is recorded.
                </div>
              )}
            </SectionPanel>
          </div>
        </div>
      )}

      {experiments.length > 0 && (
        <div className="mt-5 flex flex-col justify-between gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-xs font-semibold text-slate-200">Ready to execute the strongest contract?</div>
            <div className="mt-1 text-[11px] text-slate-500">Launch carries persona evidence, channel choices, and campaign learning into execution.</div>
          </div>
          <Link href="/launch" className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400">
            Open Launch
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </PageShell>
  )
}

function ExperimentRow({ experiment, rank, onCopy }: {
  experiment: MarketingExperiment
  rank: number
  onCopy: () => void
}) {
  const tone = readinessTone(experiment.readiness)
  return (
    <article className="px-4 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-xs font-semibold text-slate-400">
            {rank}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">{experiment.name}</h3>
              <StatusPill tone={tone}>{experiment.readiness}</StatusPill>
              <StatusPill tone="neutral">{experiment.score}/100</StatusPill>
              <StatusPill tone={experiment.designStrength === 'high' ? 'success' : experiment.designStrength === 'medium' ? 'info' : 'neutral'}>
                {experiment.designStrength} design
              </StatusPill>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">{experiment.hypothesis || 'Hypothesis not defined.'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          title="Copy operator brief"
          aria-label={`Copy ${experiment.name} operator brief`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-md border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-300 lg:self-start"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-4 grid gap-x-4 gap-y-3 border-y border-slate-800 py-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Single variable" value={experiment.variable} />
        <Detail label="Primary metric" value={experiment.primaryMetric} />
        <Detail label="Guardrail" value={experiment.guardrailMetric} />
        <Detail label="Run plan" value={runPlan(experiment)} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Variant label="Control" value={experiment.control} />
        <Variant label="Treatment" value={experiment.treatment} treatment />
      </div>

      {experiment.issues.length > 0 ? (
        <div className="mt-3 flex gap-2 text-[11px] leading-4 text-amber-200/80">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>{experiment.issues.slice(0, 3).join(' ')}</span>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Decision contract complete. Review the assumptions, then launch.
        </div>
      )}
    </article>
  )
}

function EmptyExperiments({ loading, generating, onGenerate }: {
  loading: boolean
  generating: boolean
  onGenerate: () => void
}) {
  return (
    <div className="border-y border-slate-800 py-14 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-emerald-300">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FlaskConical className="h-5 w-5" />}
      </div>
      <h2 className="mt-4 text-sm font-semibold text-slate-100">No sprint experiments queued</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
        Generate a weekly sprint to create two decision-grade experiments from the current project memory.
      </p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={loading || generating}
        className="mt-5 inline-flex h-8 items-center gap-2 rounded-md bg-emerald-500 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Generate weekly sprint
      </button>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border-slate-800 px-4 py-3 even:border-l md:not-first:border-l">
      <div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums text-slate-100', tone)}>{value}</div>
    </div>
  )
}

function ProtocolStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-800 text-[10px] font-semibold text-emerald-300">{number}</span>
      <span><strong className="text-slate-200">{title}.</strong> {detail}</span>
    </li>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div>
      <div className={cn('mt-1 text-xs leading-4', value ? 'text-slate-200' : 'text-amber-300')}>{value ?? 'Not defined'}</div>
    </div>
  )
}

function Variant({ label, value, treatment = false }: { label: string; value: string; treatment?: boolean }) {
  return (
    <div className={cn('border-l-2 pl-3', treatment ? 'border-emerald-500' : 'border-slate-600')}>
      <div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div>
      <div className={cn('mt-1 text-xs leading-4', value ? 'text-slate-300' : 'text-amber-300')}>{value || 'Not defined'}</div>
    </div>
  )
}

function readinessTone(readiness: ExperimentReadiness): StatusTone {
  if (readiness === 'ready') return 'success'
  if (readiness === 'needs-work') return 'warn'
  return 'neutral'
}

function runPlan(experiment: MarketingExperiment): string | null {
  const parts = [
    experiment.durationDays ? `${experiment.durationDays}d` : null,
    experiment.minimumSamplePerVariant ? `${experiment.minimumSamplePerVariant}/variant` : null,
    experiment.targetImprovementPct ? `${experiment.targetImprovementPct}% target` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : 'recently'
}
