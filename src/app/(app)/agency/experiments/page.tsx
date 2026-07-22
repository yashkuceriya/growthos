'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Archive,
  CheckCircle2,
  ClipboardCopy,
  FlaskConical,
  History,
  Loader2,
  Play,
  RefreshCw,
  Save,
  SearchCheck,
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
import {
  computeExperimentEvidence,
  type ExperimentActionInput,
  type ExperimentDecision,
  type ExperimentLedgerRow,
} from '@/lib/marketing/experiment-ledger'
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
  const [ledger, setLedger] = useState<ExperimentLedgerRow[]>([])
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [outcomeId, setOutcomeId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    setLedgerError(null)
    const localBrandVoice = object(activeProject.brand_voice)
    setBrandVoice(localBrandVoice)
    if (activeProject.id === LOCAL_DEV_PROJECT_ID) {
      setCampaigns([])
      setLedger([])
      setLoading(false)
      return
    }

    try {
      const [projectResult, campaignResult, ledgerResponse] = await Promise.all([
        supabase.from('projects').select('brand_voice').eq('id', activeProject.id).maybeSingle(),
        supabase
          .from('campaigns')
          .select('id, name, status, updated_at')
          .eq('project_id', activeProject.id)
          .order('updated_at', { ascending: false })
          .limit(6),
        fetch(`/api/experiments?project_id=${encodeURIComponent(activeProject.id)}`),
      ])
      if (projectResult.data?.brand_voice) setBrandVoice(object(projectResult.data.brand_voice))
      if (campaignResult.data) setCampaigns(campaignResult.data as CampaignSignal[])
      if (ledgerResponse.ok) {
        const payload = await ledgerResponse.json() as { experiments?: ExperimentLedgerRow[] }
        setLedger(payload.experiments ?? [])
      } else {
        const payload = await ledgerResponse.json().catch(() => ({})) as { error?: string }
        setLedgerError(payload.error ?? 'The evidence ledger could not be loaded.')
      }
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
  const sprintWeek = text(sprint.week_start) ?? 'current'
  const savedSourceKeys = useMemo(() => new Set(ledger.map((item) => item.sourceKey)), [ledger])

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

  async function saveExperiment(experiment: MarketingExperiment) {
    if (!activeProject || experiment.readiness !== 'ready') return
    setMutatingId(experiment.id)
    try {
      const response = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          name: experiment.name,
          hypothesis: experiment.hypothesis,
          variable: experiment.variable,
          control: experiment.control,
          treatment: experiment.treatment,
          primaryMetric: experiment.primaryMetric,
          guardrailMetric: experiment.guardrailMetric,
          targetImprovementPct: experiment.targetImprovementPct,
          plannedDurationDays: experiment.durationDays,
          minimumSamplePerVariant: experiment.minimumSamplePerVariant,
          decisionRule: experiment.decisionRule,
          channel: experiment.channel,
          source: 'sprint',
          sourceKey: `${sprintWeek}:${experiment.id}`,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not save experiment')
      toast.success(payload.created ? 'Experiment committed to the ledger' : 'Experiment already in the ledger')
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save experiment')
    } finally {
      setMutatingId(null)
    }
  }

  async function updateExperiment(id: string, action: ExperimentActionInput) {
    setMutatingId(id)
    try {
      const response = await fetch(`/api/experiments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not update experiment')
      setLedger((current) => current.map((item) => item.id === id ? payload.experiment : item))
      setOutcomeId(null)
      toast.success(action.action === 'decide' ? 'Outcome preserved' : `Experiment marked ${payload.experiment.status}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update experiment')
    } finally {
      setMutatingId(null)
    }
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
        <Stat label="Evidence ledger" value={String(ledger.length)} />
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
                  onSave={() => void saveExperiment(experiment)}
                  saved={savedSourceKeys.has(`${sprintWeek}:${experiment.id}`)}
                  saving={mutatingId === experiment.id}
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

      <SectionPanel
        className="mt-5"
        title={<span className="flex items-center gap-2"><History className="h-3.5 w-3.5 text-cyan-300" />Durable evidence ledger</span>}
        action={ledger.length ? <StatusPill tone="info">{ledger.filter((item) => item.status === 'decided').length} decided</StatusPill> : undefined}
        contentClassName="p-0"
      >
        {ledgerError ? (
          <div className="flex gap-2 px-4 py-5 text-xs leading-5 text-amber-200/80">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>{ledgerError} Apply Supabase migration 030, then refresh this page.</span>
          </div>
        ) : ledger.length ? (
          <div className="divide-y divide-slate-800">
            {ledger.map((item) => (
              <LedgerRow
                key={item.id}
                experiment={item}
                busy={mutatingId === item.id}
                recording={outcomeId === item.id}
                onRecord={() => setOutcomeId((current) => current === item.id ? null : item.id)}
                onAction={(action) => void updateExperiment(item.id, action)}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-xs leading-5 text-slate-500">
            Save a run-ready sprint experiment to preserve its decision contract and begin collecting evidence.
          </div>
        )}
      </SectionPanel>

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

function ExperimentRow({ experiment, rank, onCopy, onSave, saved, saving }: {
  experiment: MarketingExperiment
  rank: number
  onCopy: () => void
  onSave: () => void
  saved: boolean
  saving: boolean
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
        <div className="flex shrink-0 gap-2 self-end lg:self-start">
          <button
            type="button"
            onClick={onCopy}
            title="Copy operator brief"
            aria-label={`Copy ${experiment.name} operator brief`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saved || saving || experiment.readiness !== 'ready'}
            title={saved ? 'Saved to evidence ledger' : experiment.readiness === 'ready' ? 'Save to evidence ledger' : 'Complete the decision contract before saving'}
            aria-label={`Save ${experiment.name} to evidence ledger`}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-700 px-2.5 text-[11px] font-semibold text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
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

function LedgerRow({ experiment, busy, recording, onRecord, onAction }: {
  experiment: ExperimentLedgerRow
  busy: boolean
  recording: boolean
  onRecord: () => void
  onAction: (action: ExperimentActionInput) => void
}) {
  const evidence = computeExperimentEvidence(experiment)
  const canRecord = experiment.status === 'running' || experiment.status === 'analyzing'

  return (
    <article className="px-4 py-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">{experiment.name}</h3>
            <StatusPill tone={ledgerStatusTone(experiment.status)}>{experiment.status}</StatusPill>
            <StatusPill tone={evidence.label === 'sample-complete' ? 'success' : evidence.label === 'directional' ? 'warn' : 'neutral'}>
              {evidence.label.replace('-', ' ')}
            </StatusPill>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">{experiment.hypothesis}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {experiment.status === 'ready' && (
            <ActionButton icon={Play} label="Start" busy={busy} onClick={() => onAction({ action: 'start' })} />
          )}
          {experiment.status === 'running' && (
            <ActionButton icon={SearchCheck} label="Analyze" busy={busy} onClick={() => onAction({ action: 'analyze' })} />
          )}
          {canRecord && (
            <ActionButton icon={CheckCircle2} label="Record outcome" busy={busy} active={recording} onClick={onRecord} />
          )}
          {experiment.status === 'decided' && (
            <ActionButton icon={Archive} label="Archive" busy={busy} onClick={() => onAction({ action: 'archive' })} />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-y border-slate-800 py-3 sm:grid-cols-2 lg:grid-cols-4">
        <EvidenceProgress label="Minimum sample" value={evidence.sampleProgressPct} detail={`${Math.min(experiment.controlExposures, experiment.treatmentExposures)} / ${experiment.minimumSamplePerVariant} each`} />
        <EvidenceProgress label="Planned duration" value={evidence.durationProgressPct} detail={`${experiment.plannedDurationDays} days planned`} />
        <Detail label="Observed lift" value={evidence.observedLiftPct === null ? null : formatPercent(evidence.observedLiftPct)} />
        <Detail label="Decision" value={experiment.decision ? decisionLabel(experiment.decision) : null} />
      </div>

      <div className="mt-3 flex flex-col gap-1 text-[11px] leading-4 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>{evidence.note}</span>
        <span className="shrink-0">Updated {formatDate(experiment.updatedAt)}</span>
      </div>
      {experiment.conclusion && <p className="mt-3 border-l-2 border-cyan-500 pl-3 text-xs leading-5 text-slate-300">{experiment.conclusion}</p>}

      {recording && (
        <OutcomeForm
          busy={busy}
          onSubmit={(action) => onAction(action)}
        />
      )}
    </article>
  )
}

function OutcomeForm({ busy, onSubmit }: {
  busy: boolean
  onSubmit: (action: Extract<ExperimentActionInput, { action: 'decide' }>) => void
}) {
  const [controlExposures, setControlExposures] = useState('')
  const [treatmentExposures, setTreatmentExposures] = useState('')
  const [controlValue, setControlValue] = useState('')
  const [treatmentValue, setTreatmentValue] = useState('')
  const [guardrailControlValue, setGuardrailControlValue] = useState('')
  const [guardrailTreatmentValue, setGuardrailTreatmentValue] = useState('')
  const [decision, setDecision] = useState<ExperimentDecision>('inconclusive')
  const [conclusion, setConclusion] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    onSubmit({
      action: 'decide',
      controlExposures: Number(controlExposures),
      treatmentExposures: Number(treatmentExposures),
      controlValue: Number(controlValue),
      treatmentValue: Number(treatmentValue),
      guardrailControlValue: guardrailControlValue === '' ? null : Number(guardrailControlValue),
      guardrailTreatmentValue: guardrailTreatmentValue === '' ? null : Number(guardrailTreatmentValue),
      decision,
      conclusion,
    })
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-slate-800 pt-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Control exposures" value={controlExposures} onChange={setControlExposures} integer />
        <NumberField label="Treatment exposures" value={treatmentExposures} onChange={setTreatmentExposures} integer />
        <NumberField label="Control metric" value={controlValue} onChange={setControlValue} />
        <NumberField label="Treatment metric" value={treatmentValue} onChange={setTreatmentValue} />
        <NumberField label="Control guardrail" value={guardrailControlValue} onChange={setGuardrailControlValue} optional />
        <NumberField label="Treatment guardrail" value={guardrailTreatmentValue} onChange={setGuardrailTreatmentValue} optional />
        <label className="block">
          <span className="text-[10px] font-semibold uppercase text-slate-500">Decision</span>
          <select value={decision} onChange={(event) => setDecision(event.target.value as ExperimentDecision)} className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none">
            <option value="inconclusive">Inconclusive</option>
            <option value="promote_treatment">Promote treatment</option>
            <option value="promote_control">Keep control</option>
            <option value="iterate">Iterate</option>
            <option value="stop">Stop</option>
          </select>
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-[10px] font-semibold uppercase text-slate-500">Conclusion</span>
        <textarea
          required
          minLength={8}
          rows={3}
          value={conclusion}
          onChange={(event) => setConclusion(event.target.value)}
          placeholder="What did we learn, what will change, and what remains uncertain?"
          className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={busy} className="inline-flex h-8 items-center gap-2 rounded-md bg-emerald-500 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Preserve decision
        </button>
      </div>
    </form>
  )
}

function NumberField({ label, value, onChange, integer = false, optional = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  integer?: boolean
  optional?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase text-slate-500">{label}</span>
      <input
        required={!optional}
        type="number"
        min={integer ? 0 : undefined}
        step={integer ? 1 : 'any'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs tabular-nums text-slate-200 focus:border-emerald-500 focus:outline-none"
      />
    </label>
  )
}

function ActionButton({ icon: Icon, label, busy, active = false, onClick }: {
  icon: typeof Play
  label: string
  busy: boolean
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold disabled:opacity-50',
        active ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300',
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

function EvidenceProgress({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase text-slate-500">
        <span>{label}</span><span className="tabular-nums text-slate-400">{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-cyan-500" style={{ width: `${value}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-slate-600">{detail}</div>
    </div>
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

function ledgerStatusTone(status: ExperimentLedgerRow['status']): StatusTone {
  if (status === 'running') return 'info'
  if (status === 'analyzing') return 'warn'
  if (status === 'decided') return 'success'
  return 'neutral'
}

function decisionLabel(decision: ExperimentDecision): string {
  const labels: Record<ExperimentDecision, string> = {
    promote_control: 'Keep control',
    promote_treatment: 'Promote treatment',
    iterate: 'Iterate',
    inconclusive: 'Inconclusive',
    stop: 'Stop',
  }
  return labels[decision]
}

function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
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
