'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Brain, CheckCircle2, FlaskConical, History, Lightbulb, Loader2, Plus, RefreshCw, Target, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { useProject } from '@/hooks/use-project'
import type { MarketingPersona, PersonaSkepticism } from '@/lib/marketing/personas'
import { buildPersonaExperimentBoard, type PersonaExperimentRow, type PersonaLearningDigest } from '@/lib/marketing/persona-learning'
import { cn } from '@/lib/utils'

const EMPTY_FORM = {
  name: '',
  role: '',
  description: '',
  painPoints: '',
  objections: '',
  buyingTriggers: '',
  desiredOutcomes: '',
  vocabulary: '',
  preferredChannels: '',
  skepticismLevel: 'medium' as PersonaSkepticism,
  isPrimary: false,
}

export default function PersonasPage() {
  const { activeProject } = useProject()
  const [personas, setPersonas] = useState<MarketingPersona[]>([])
  const [personaLearning, setPersonaLearning] = useState<Record<string, PersonaLearningDigest>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inferred, setInferred] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const selected = useMemo(
    () => personas.find((persona) => persona.id === selectedId) ?? personas[0] ?? null,
    [personas, selectedId],
  )
  const selectedLearning = selected ? personaLearning[selected.id] ?? null : null
  const experimentRows = useMemo(
    () => buildPersonaExperimentBoard(personas, personaLearning),
    [personas, personaLearning],
  )

  async function load() {
    if (!activeProject?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/personas?project_id=${encodeURIComponent(activeProject.id)}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not load personas')
      setPersonas(body.personas ?? [])
      setPersonaLearning(body.personaLearning ?? {})
      setInferred(Boolean(body.inferred))
      setSelectedId((current) => current ?? body.personas?.[0]?.id ?? null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load personas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  async function savePersona(event: React.FormEvent) {
    event.preventDefault()
    if (!activeProject?.id) return
    setSaving(true)
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          name: form.name,
          role: form.role || null,
          description: form.description || null,
          painPoints: list(form.painPoints),
          objections: list(form.objections),
          buyingTriggers: list(form.buyingTriggers),
          desiredOutcomes: list(form.desiredOutcomes),
          vocabulary: list(form.vocabulary),
          preferredChannels: list(form.preferredChannels),
          skepticismLevel: form.skepticismLevel,
          isPrimary: form.isPrimary,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not save persona')
      toast.success('Persona saved')
      setForm(EMPTY_FORM)
      setSelectedId(body.persona?.id ?? null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save persona')
    } finally {
      setSaving(false)
    }
  }

  async function makePrimary(persona: MarketingPersona) {
    if (persona.id.startsWith('preset-')) {
      setForm({
        name: persona.name,
        role: persona.role ?? '',
        description: persona.description ?? '',
        painPoints: persona.painPoints.join('\n'),
        objections: persona.objections.join('\n'),
        buyingTriggers: persona.buyingTriggers.join('\n'),
        desiredOutcomes: persona.desiredOutcomes.join('\n'),
        vocabulary: persona.vocabulary.join(', '),
        preferredChannels: persona.preferredChannels.join(', '),
        skepticismLevel: persona.skepticismLevel,
        isPrimary: true,
      })
      toast.info('Review and save this inferred persona to make it primary')
      return
    }

    const res = await fetch('/api/personas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...persona, isPrimary: true }),
    })
    if (!res.ok) toast.error('Could not set primary persona')
    else {
      toast.success('Primary persona updated')
      await load()
    }
  }

  if (!activeProject) {
    return <PageShell><p className="text-slate-400">Select a project</p></PageShell>
  }

  return (
    <PageShell>
      <PageHeader
        title="Personas"
        subtitle="Buyer minds for scoring, rewriting, and steering every marketing agent."
        actions={
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        }
      />

      {inferred && (
        <div className="mb-4 rounded-md border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-xs text-sky-100">
          These are inferred from project memory. Save one below when you want it persisted and editable.
        </div>
      )}

      <PersonaExperimentBoard rows={experimentRows} onSelect={setSelectedId} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionPanel title={`${personas.length} persona${personas.length === 1 ? '' : 's'}`} contentClassName="p-0">
          {loading && personas.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> Loading personas...
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {personas.map((persona) => (
                <li key={persona.id}>
                  <button
                    onClick={() => setSelectedId(persona.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/50',
                      selected?.id === persona.id && 'bg-emerald-500/5',
                    )}
                  >
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">{persona.name}</span>
                        {persona.isPrimary && <StatusPill tone="success"><CheckCircle2 className="h-3 w-3" /> Primary</StatusPill>}
                        <StatusPill tone={persona.skepticismLevel === 'high' ? 'warn' : 'info'}>{persona.skepticismLevel} skepticism</StatusPill>
                      </span>
                      <span className="line-clamp-2 text-xs text-slate-400">{persona.description ?? persona.role ?? 'Buyer persona'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>

        <div className="space-y-4">
          <SectionPanel
            title={selected ? selected.name : 'Persona Detail'}
            action={selected ? (
              <button
                onClick={() => void makePrimary(selected)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/15"
              >
                <Target className="h-3 w-3" /> Make Primary
              </button>
            ) : null}
          >
            {selected ? (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-slate-300">{selected.description}</p>
                <PersonaList title="Pain Points" items={selected.painPoints} />
                <PersonaList title="Objections" items={selected.objections} />
                <PersonaList title="Desired Outcomes" items={selected.desiredOutcomes} />
                <PersonaList title="Vocabulary" items={selected.vocabulary} compact />
                <PersonaLearningBlock learning={selectedLearning} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">No persona selected.</p>
            )}
          </SectionPanel>

          <SectionPanel title="Add Persona" action={<Plus className="h-4 w-4 text-emerald-300" />}>
            <form onSubmit={(event) => void savePersona(event)} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
                <Field label="Role" value={form.role} onChange={(value) => setForm({ ...form, role: value })} />
              </div>
              <TextField label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <TextField label="Pain points" value={form.painPoints} onChange={(value) => setForm({ ...form, painPoints: value })} />
                <TextField label="Objections" value={form.objections} onChange={(value) => setForm({ ...form, objections: value })} />
                <TextField label="Buying triggers" value={form.buyingTriggers} onChange={(value) => setForm({ ...form, buyingTriggers: value })} />
                <TextField label="Desired outcomes" value={form.desiredOutcomes} onChange={(value) => setForm({ ...form, desiredOutcomes: value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Vocabulary" value={form.vocabulary} onChange={(value) => setForm({ ...form, vocabulary: value })} />
                <Field label="Preferred channels" value={form.preferredChannels} onChange={(value) => setForm({ ...form, preferredChannels: value })} />
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <select
                  value={form.skepticismLevel}
                  onChange={(event) => setForm({ ...form, skepticismLevel: event.target.value as PersonaSkepticism })}
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="low">Low skepticism</option>
                  <option value="medium">Medium skepticism</option>
                  <option value="high">High skepticism</option>
                </select>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={form.isPrimary} onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })} />
                  Primary persona
                </label>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                  Save Persona
                </button>
              </div>
            </form>
          </SectionPanel>
        </div>
      </div>
    </PageShell>
  )
}

function PersonaExperimentBoard({ rows, onSelect }: { rows: PersonaExperimentRow[]; onSelect: (id: string) => void }) {
  const readyCount = rows.filter((row) => row.confidence === 'strong').length
  const coldCount = rows.filter((row) => row.confidence === 'cold').length
  return (
    <SectionPanel
      title="Persona Experiment Board"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="success">{readyCount} ready</StatusPill>
          <StatusPill tone={coldCount > 0 ? 'warn' : 'neutral'}>{coldCount} cold</StatusPill>
        </div>
      }
      className="mb-4"
    >
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Create or infer personas to start planning persona-specific experiments.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {rows.slice(0, 3).map((row) => (
            <article key={row.personaId} className="rounded-md border border-slate-800 bg-slate-900/55 p-3">
              <div className="mb-3 flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(row.personaId)}
                  className="min-w-0 text-left"
                >
                  <div className="truncate text-sm font-semibold text-slate-100">{row.personaName}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.role ?? 'Persona'} · evidence {row.evidenceScore}</div>
                </button>
                <StatusPill tone={confidenceTone(row.confidence)}>{row.confidence}</StatusPill>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {row.bestChannel && <StatusPill tone="info"><TrendingUp className="h-3 w-3" /> {row.bestChannel}</StatusPill>}
                {row.reworkChannel && <StatusPill tone="warn"><TrendingDown className="h-3 w-3" /> rework {row.reworkChannel}</StatusPill>}
                {row.historyCount > 0 && <StatusPill tone="neutral"><History className="h-3 w-3" /> {row.historyCount} run{row.historyCount === 1 ? '' : 's'}</StatusPill>}
              </div>
              <p className="line-clamp-2 min-h-10 text-xs leading-5 text-slate-400">{row.insight}</p>
              <div className="mt-3 rounded border border-slate-800 bg-slate-950/60 p-2">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <FlaskConical className="h-3 w-3 text-emerald-300" />
                  Next test
                </div>
                <p className="line-clamp-2 min-h-10 text-xs leading-5 text-slate-300">{row.nextTest}</p>
              </div>
              <a
                href={row.launchHref}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
              >
                Launch test <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </article>
          ))}
        </div>
      )}
    </SectionPanel>
  )
}

function confidenceTone(confidence: PersonaExperimentRow['confidence']) {
  if (confidence === 'strong') return 'success'
  if (confidence === 'learning') return 'info'
  return 'warn'
}

function PersonaLearningBlock({ learning }: { learning: PersonaLearningDigest | null }) {
  return (
    <div className="border-t border-slate-800 pt-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Brain className="h-3.5 w-3.5 text-emerald-300" />
        Campaign Learning
        {learning && <StatusPill tone="neutral"><History className="h-3 w-3" /> {learning.historyCount} run{learning.historyCount === 1 ? '' : 's'}</StatusPill>}
      </div>
      {!learning ? (
        <p className="text-xs leading-5 text-slate-500">No campaign learning captured for this persona yet.</p>
      ) : (
        <div className="space-y-3">
          {learning.insightSignal && (
            <div className="flex gap-2 text-sm text-slate-200">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <span>{learning.insightSignal}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {learning.bestChannel && <StatusPill tone="success"><TrendingUp className="h-3 w-3" /> Best {learning.bestChannel}</StatusPill>}
            {learning.worstChannel && <StatusPill tone="warn"><TrendingDown className="h-3 w-3" /> Rework {learning.worstChannel}</StatusPill>}
            {learning.manualTaskCount > 0 && <StatusPill tone="info">{learning.manualTaskCount} manual task{learning.manualTaskCount === 1 ? '' : 's'}</StatusPill>}
          </div>
          {learning.recommendedNext.length > 0 && (
            <ul className="space-y-1.5 text-xs leading-5 text-slate-400">
              {learning.recommendedNext.slice(0, 3).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="font-mono-data text-[10px] text-slate-600">-&gt;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-600">
            Updated {new Date(learning.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}

function PersonaList({ title, items, compact = false }: { title: string; items: string[]; compact?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? items.map((item) => (
          <span key={item} className={cn('rounded border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300', compact ? 'text-[10px]' : 'text-xs')}>
            {item}
          </span>
        )) : <span className="text-xs text-slate-500">None yet</span>}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
      />
    </label>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
      />
    </label>
  )
}

function list(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
}
