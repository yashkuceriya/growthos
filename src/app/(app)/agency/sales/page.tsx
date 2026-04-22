'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import {
  Mail, Briefcase, Swords, MessageSquareWarning, ClipboardList, PlayCircle,
  Calculator, UserCheck, Loader2, Copy, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = 'outbound_sequence' | 'linkedin_sequence' | 'battle_card' | 'objection_library' | 'discovery_script' | 'demo_script' | 'roi_calculator' | 'icp_builder'

const TOOLS: Array<{ key: Tool; label: string; icon: typeof Mail; desc: string; needs: string }> = [
  { key: 'icp_builder', label: 'ICP Builder', icon: UserCheck, desc: 'Ideal Customer Profile with firmographics, JTBD, triggers, watering holes', needs: 'nothing' },
  { key: 'outbound_sequence', label: 'Cold Email Sequence', icon: Mail, desc: '4-6 email cadence, A/B subject lines, deliverability checklist', needs: 'target persona + pain point' },
  { key: 'linkedin_sequence', label: 'LinkedIn Cadence', icon: Briefcase, desc: '4-6 step LI outbound — profile views, comments, DMs, InMail', needs: 'target persona' },
  { key: 'battle_card', label: 'Battle Card', icon: Swords, desc: 'Vs one competitor — strengths, weaknesses, talk tracks, traps', needs: 'competitor name' },
  { key: 'objection_library', label: 'Objection Library', icon: MessageSquareWarning, desc: '10-15 objections with root cause, reframe, response', needs: 'nothing' },
  { key: 'discovery_script', label: 'Discovery Script', icon: ClipboardList, desc: 'BANT / MEDDIC / SPIN / CHAMP / GPCT frameworks', needs: 'framework pick' },
  { key: 'demo_script', label: 'Demo Script', icon: PlayCircle, desc: 'Beat-by-beat demo with objection preempts', needs: 'nothing' },
  { key: 'roi_calculator', label: 'ROI Calculator', icon: Calculator, desc: 'Embeddable HTML + JS calculator with inputs and formulas', needs: 'nothing' },
]

export default function SalesPage() {
  const { activeProject } = useProject()
  const [tool, setTool] = useState<Tool>('icp_builder')
  const [running, setRunning] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null)

  const [persona, setPersona] = useState('')
  const [pain, setPain] = useState('')
  const [competitor, setCompetitor] = useState('')
  const [framework, setFramework] = useState('MEDDIC')

  async function run() {
    if (!activeProject) return
    setRunning(true)
    setResult(null)
    try {
      const input: Record<string, unknown> = {}
      if (tool === 'outbound_sequence' || tool === 'linkedin_sequence') input.target_persona = persona
      if (tool === 'outbound_sequence') input.pain_point = pain
      if (tool === 'battle_card') input.competitor = competitor
      if (tool === 'discovery_script') input.framework = framework

      const res = await fetch('/api/agency/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, tool, input }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setResult(json.result)
      toast.success('Done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setRunning(false)
  }

  function copyText(txt: string) {
    navigator.clipboard.writeText(txt)
    toast.success('Copied')
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  return (
    <PageShell>
      <PageHeader title="Sales Outbound Suite" subtitle="Everything an SDR + AE team uses — cold cadences, battle cards, discovery, demos, ROI" />

      <div className="grid grid-cols-4 gap-3 mb-4">
        {TOOLS.map((t) => {
          const Icon = t.icon
          const active = tool === t.key
          return (
            <button
              key={t.key}
              onClick={() => { setTool(t.key); setResult(null) }}
              className={cn(
                'text-left rounded-md border p-3 transition-all',
                active ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-md bg-slate-800', active ? 'text-emerald-400' : 'text-slate-400')}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {active && <StatusPill tone="accent">Active</StatusPill>}
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{t.label}</h3>
              <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">{t.desc}</p>
            </button>
          )
        })}
      </div>

      <SectionPanel className="mb-4" title={TOOLS.find((t) => t.key === tool)!.label}>
        <p className="text-xs text-slate-500 mb-3">Inputs: {TOOLS.find((t) => t.key === tool)!.needs}</p>
        <div className="space-y-2">
          {(tool === 'outbound_sequence' || tool === 'linkedin_sequence') && (
            <input value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Target persona (e.g. VP of Marketing at Series A B2B SaaS, 100-500 employees)" className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
          )}
          {tool === 'outbound_sequence' && (
            <input value={pain} onChange={(e) => setPain(e.target.value)} placeholder="Pain point (e.g. 'their CAC is up 40% but signups are flat')" className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
          )}
          {tool === 'battle_card' && (
            <input value={competitor} onChange={(e) => setCompetitor(e.target.value)} placeholder="Competitor name (e.g. Huntr, Teal, Simplify)" className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
          )}
          {tool === 'discovery_script' && (
            <select value={framework} onChange={(e) => setFramework(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
              <option value="MEDDIC">MEDDIC</option>
              <option value="BANT">BANT</option>
              <option value="SPIN">SPIN</option>
              <option value="CHAMP">CHAMP</option>
              <option value="GPCT">GPCT</option>
            </select>
          )}
          <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Run Tool'}
          </button>
        </div>
      </SectionPanel>

      {result && <ResultPanel tool={tool} result={result} onCopy={copyText} />}
    </PageShell>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResultPanel({ tool, result, onCopy }: { tool: Tool; result: any; onCopy: (s: string) => void }) {
  if (tool === 'outbound_sequence') {
    return (
      <SectionPanel className="border-emerald-500/30" title={`${result.sequence_name} · ${result.total_duration_days} days`}>
        <p className="text-sm text-slate-300 mb-3">Target: {result.target_persona}</p>
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.emails?.map((e: any, i: number) => (
            <EmailStep key={i} step={e} onCopy={onCopy} />
          ))}
        </div>
        <div className="mt-4 rounded-md border border-slate-800 bg-slate-800/40 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Deliverability Checklist</div>
          <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.deliverability_checklist?.map((c: string, i: number) => <li key={i}>{c}</li>)}
          </ul>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(result.follow_up_rules ?? {}).map(([k, v]) => (
            <div key={k} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">{k.replace(/_/g, ' ')}</div>
              <p className="mt-1 text-xs text-slate-300">{v as string}</p>
            </div>
          ))}
        </div>
      </SectionPanel>
    )
  }

  if (tool === 'linkedin_sequence') {
    return (
      <SectionPanel className="border-emerald-500/30" title={`LinkedIn Cadence · ${result.target_persona}`}>
        <ul className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.steps?.map((s: any, i: number) => (
            <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <StatusPill tone="accent">Step {s.step}</StatusPill>
                  <StatusPill tone="neutral">Day {s.day}</StatusPill>
                  <StatusPill tone="info">{s.type.replace(/_/g, ' ')}</StatusPill>
                </div>
                <button onClick={() => onCopy(s.message)} className="text-slate-400 hover:text-slate-100"><Copy className="h-3.5 w-3.5" /></button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-200">{s.message}</pre>
              <p className="mt-2 text-[11px] text-slate-500 italic">{s.rationale}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Between-Step Engagement</div>
          <ul className="list-disc list-inside text-xs text-slate-200 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.engagement_tips?.map((t: string, i: number) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      </SectionPanel>
    )
  }

  if (tool === 'battle_card') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`Battle Card · ${result.competitor}`}>
          <p className="text-sm text-slate-300 mb-3">{result.one_line_summary}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Their Positioning</div>
              <p className="mt-1 text-xs text-slate-300">{result.their_positioning}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ideal Customer</div>
              <p className="mt-1 text-xs text-slate-300">{result.their_ideal_customer}</p>
            </div>
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Where We Win</div>
              <ul className="mt-1 text-xs text-slate-200 space-y-0.5">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.our_strengths_vs_them?.map((s: string, i: number) => <li key={i}>· {s}</li>)}
              </ul>
            </div>
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">Where They Win</div>
              <ul className="mt-1 text-xs text-slate-200 space-y-0.5">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.our_weaknesses_vs_them?.map((s: string, i: number) => <li key={i}>· {s}</li>)}
              </ul>
            </div>
          </div>
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Talk Track When Prospect Mentions Them</div>
              <button onClick={() => onCopy(result.talk_track_when_prospect_mentions_them)} className="text-emerald-300 hover:text-emerald-100"><Copy className="h-3.5 w-3.5" /></button>
            </div>
            <p className="text-sm text-slate-100 italic">&ldquo;{result.talk_track_when_prospect_mentions_them}&rdquo;</p>
          </div>
        </SectionPanel>

        <SectionPanel title="Feature Comparison" contentClassName="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2 text-left">Feature</th>
                <th className="px-3 py-2 text-left">Us</th>
                <th className="px-3 py-2 text-left">Them</th>
                <th className="px-3 py-2 text-center">Winner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.feature_comparison?.map((f: any, i: number) => (
                <tr key={i} className={f.winner === 'us' ? 'bg-emerald-500/5' : f.winner === 'them' ? 'bg-rose-500/5' : ''}>
                  <td className="px-3 py-2 text-slate-200 font-semibold">{f.feature}</td>
                  <td className="px-3 py-2 text-slate-300">{f.us}</td>
                  <td className="px-3 py-2 text-slate-400">{f.them}</td>
                  <td className="px-3 py-2 text-center"><StatusPill tone={f.winner === 'us' ? 'success' : f.winner === 'them' ? 'error' : 'neutral'}>{f.winner}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-3">
          <SectionPanel title="Go-To Segments (We Crush)">
            <ul className="text-xs text-emerald-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.land_grab_segments?.map((s: string, i: number) => <li key={i}>· {s}</li>)}
            </ul>
          </SectionPanel>
          <SectionPanel title="Avoid Segments (They Win)">
            <ul className="text-xs text-rose-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.avoid_segments?.map((s: string, i: number) => <li key={i}>· {s}</li>)}
            </ul>
          </SectionPanel>
        </div>

        <SectionPanel title="Discovery Traps (Questions That Expose Them)">
          <ul className="text-sm text-slate-200 space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.traps_to_set?.map((t: string, i: number) => <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 px-3 py-2">{t}</li>)}
          </ul>
        </SectionPanel>

        <SectionPanel className="border-emerald-500/30" title="Switching Incentive">
          <p className="text-sm text-slate-100">{result.switching_incentive}</p>
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'objection_library') {
    return (
      <SectionPanel title="Objection Library">
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.objections?.map((o: any, i: number) => (
            <ObjectionCard key={i} obj={o} onCopy={onCopy} />
          ))}
        </div>
      </SectionPanel>
    )
  }

  if (tool === 'discovery_script') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`Discovery · ${result.framework} · ${result.call_duration_minutes} min`}>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Warmup</div>
              <p className="text-xs text-slate-200">{result.opening?.warmup}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Agenda</div>
              <p className="text-xs text-slate-200">{result.opening?.agenda_setter}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Time Check</div>
              <p className="text-xs text-slate-200">{result.opening?.mutual_time_check}</p>
            </div>
          </div>
        </SectionPanel>

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {result.sections?.map((s: any, i: number) => (
          <SectionPanel key={i} title={<span className="flex items-center gap-2">{s.section}<StatusPill tone="neutral">{s.time_allotted_min} min</StatusPill></span>}>
            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Questions</div>
              <ol className="list-decimal list-inside text-sm text-slate-200 space-y-1">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {s.questions?.map((q: string, j: number) => <li key={j}>{q}</li>)}
              </ol>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Listen For</div>
                <ul className="text-xs text-slate-200 space-y-0.5">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {s.listen_for?.map((l: string, j: number) => <li key={j}>· {l}</li>)}
                </ul>
              </div>
              <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400 mb-1">Red Flags</div>
                <ul className="text-xs text-slate-200 space-y-0.5">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {s.red_flags?.map((r: string, j: number) => <li key={j}>· {r}</li>)}
                </ul>
              </div>
            </div>
          </SectionPanel>
        ))}

        <SectionPanel className="border-emerald-500/30" title="Closing & MAP">
          <p className="text-sm text-slate-200 mb-3">{result.closing?.summary}</p>
          <div className="mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Next Steps Options</div>
            <ul className="text-sm text-slate-200 space-y-1">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.closing?.next_steps_options?.map((n: string, i: number) => <li key={i}>· {n}</li>)}
            </ul>
          </div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Mutual Action Plan</div>
            <p className="text-sm text-slate-100">{result.closing?.mutual_action_plan}</p>
          </div>
        </SectionPanel>

        <SectionPanel title="Post-Call Scorecard" contentClassName="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2 text-left">Criterion</th>
                <th className="px-3 py-2 text-center">Max</th>
                <th className="px-3 py-2 text-left">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.scorecard?.map((c: any, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-200 font-semibold">{c.criterion}</td>
                  <td className="px-3 py-2 text-center font-mono-data text-emerald-300">{c.max_points}</td>
                  <td className="px-3 py-2 text-slate-400">{c.evidence_needed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'demo_script') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`Demo · ${result.demo_length_minutes} min`}>
          <div className="mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Pre-Demo Questions (send async)</div>
            <ul className="text-sm text-slate-200 space-y-1">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.pre_demo_questions?.map((q: string, i: number) => <li key={i}>· {q}</li>)}
            </ul>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Recap Pain</div>
              <p className="text-xs text-slate-200">{result.opening?.recap_pain}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Demo Promise</div>
              <p className="text-xs text-slate-200">{result.opening?.demo_promise}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Agenda</div>
              <p className="text-xs text-slate-200">{result.opening?.agenda}</p>
            </div>
          </div>
        </SectionPanel>

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {result.demo_beats?.map((b: any, i: number) => (
          <SectionPanel key={i} title={<span className="flex items-center gap-2">Beat {b.beat_number}: {b.name}<StatusPill tone="neutral">{b.time_minutes} min</StatusPill></span>}>
            <div className="space-y-2 text-sm">
              <div><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Show:</span> <span className="text-slate-200">{b.what_to_show}</span></div>
              <div><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Frame:</span> <span className="text-slate-200">{b.how_to_frame}</span></div>
              <div><span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Interactive:</span> <span className="text-slate-100">{b.interactive_moment}</span></div>
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-slate-200"><strong>Wow reaction:</strong> {b.common_wow_reaction}</div>
            </div>
          </SectionPanel>
        ))}

        <SectionPanel title="Objection Preempts">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.objection_anticipations?.map((o: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-xs font-semibold text-amber-300 mb-1">&ldquo;{o.likely_objection}&rdquo;</div>
                <p className="text-xs text-slate-200">Preempt: {o.preempt}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel className="border-emerald-500/30" title="Closing">
          <p className="text-sm text-slate-200 mb-3">{result.closing?.recap_value}</p>
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Commitment Ask</div>
            <p className="text-sm text-slate-100 italic">&ldquo;{result.closing?.commitment_ask}&rdquo;</p>
          </div>
          <ul className="text-sm text-slate-200 space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.closing?.next_step_options?.map((n: string, i: number) => <li key={i}>· {n}</li>)}
          </ul>
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'roi_calculator') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={result.name}>
          <p className="text-sm text-slate-300 mb-3">{result.description}</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Inputs</div>
              <ul className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.inputs?.map((inp: any, i: number) => (
                  <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-2">
                    <div className="text-xs font-semibold text-slate-100">{inp.label}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px]">
                      <StatusPill tone="neutral">{inp.type}</StatusPill>
                      <span className="font-mono-data text-slate-500">default: {String(inp.default_value)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{inp.help_text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Calculations</div>
              <ul className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.calculations?.map((c: any, i: number) => (
                  <li key={i} className={cn('rounded-md border p-2', c.key === result.headline_metric_key ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-800/40')}>
                    <div className="text-xs font-semibold text-slate-100">{c.label}</div>
                    <code className="mt-1 block font-mono-data text-[10px] text-slate-400">{c.formula}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionPanel>

        <SectionPanel
          title="Embed HTML"
          action={<button onClick={() => onCopy(result.embed_html)} className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"><Copy className="h-3 w-3 inline mr-1" />Copy HTML</button>}
          contentClassName="p-0"
        >
          <pre className="overflow-x-auto bg-slate-950 p-4 font-mono-data text-[10px] text-emerald-300 whitespace-pre-wrap max-h-96">{result.embed_html}</pre>
        </SectionPanel>

        <SectionPanel title="Assumptions">
          <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.assumptions?.map((a: string, i: number) => <li key={i}>{a}</li>)}
          </ul>
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'icp_builder') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`ICP: ${result.icp_name}`}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Firmographics</div>
              <dl className="space-y-1 text-xs">
                {Object.entries(result.firmographics ?? {}).map(([k, v]) => (
                  <div key={k}><dt className="inline text-slate-500 capitalize">{k.replace(/_/g, ' ')}: </dt><dd className="inline text-slate-200">{Array.isArray(v) ? (v as string[]).join(', ') : (v as string)}</dd></div>
                ))}
              </dl>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Buyer Persona</div>
              <dl className="space-y-1 text-xs">
                {Object.entries(result.buyer_persona ?? {}).map(([k, v]) => (
                  <div key={k}><dt className="inline text-slate-500 capitalize">{k.replace(/_/g, ' ')}: </dt><dd className="inline text-slate-200">{Array.isArray(v) ? (v as string[]).join(', ') : (v as string)}</dd></div>
                ))}
              </dl>
            </div>
          </div>
          <div className="mt-3">
            <StatusPill tone="accent">Sales Motion: {result.sales_motion?.replace(/_/g, ' ')}</StatusPill>
          </div>
        </SectionPanel>

        <SectionPanel title="Top 3 Pains">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.pains_top_3?.map((p: any, i: number) => (
              <li key={i} className="rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
                <div className="text-sm font-semibold text-rose-100">{p.pain}</div>
                <p className="mt-1 text-xs text-slate-300">Cost of status quo: {p.status_quo_cost}</p>
                <p className="text-xs text-slate-400">Emotional impact: {p.emotional_impact}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel title="Jobs to Be Done">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.jobs_to_be_done?.map((j: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3 text-xs">
                <div className="font-semibold text-slate-100">{j.job}</div>
                <p className="text-slate-400 mt-1">Context: {j.context}</p>
                <p className="text-slate-400">Current solution: {j.current_solution}</p>
                <p className="text-emerald-300 mt-1">Unmet: {j.unmet_need}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-3">
          <SectionPanel title="Buying Triggers">
            <ul className="text-xs text-slate-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.buying_triggers?.map((t: string, i: number) => <li key={i}>· {t}</li>)}
            </ul>
          </SectionPanel>
          <SectionPanel title="Disqualifiers">
            <ul className="text-xs text-rose-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.disqualifiers?.map((d: string, i: number) => <li key={i}>· {d}</li>)}
            </ul>
          </SectionPanel>
        </div>

        <SectionPanel title="Watering Holes (Where They Spend Attention)">
          <div className="flex flex-wrap gap-1.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.watering_holes?.map((w: string, i: number) => <StatusPill key={i} tone="info">{w}</StatusPill>)}
          </div>
        </SectionPanel>

        <SectionPanel title="Top 3 Messaging Angles">
          <ol className="list-decimal list-inside text-sm text-slate-200 space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.ideal_messaging_angles?.map((a: string, i: number) => <li key={i}>{a}</li>)}
          </ol>
        </SectionPanel>
      </div>
    )
  }

  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EmailStep({ step, onCopy }: { step: any; onCopy: (s: string) => void }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="rounded-md border border-slate-800 bg-slate-800/40 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/60">
        <div className="flex items-center gap-2">
          <StatusPill tone="accent">Step {step.step}</StatusPill>
          <StatusPill tone="neutral">Day {step.send_day}</StatusPill>
          <StatusPill tone="info">{step.purpose.replace(/_/g, ' ')}</StatusPill>
          <span className="text-sm text-slate-100 font-semibold">{step.subject_line}</span>
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-mono-data text-slate-500">
            <span>A: {step.subject_line}</span>
            <span>·</span>
            <span>B: {step.subject_variant_b}</span>
          </div>
          <div className="text-[10px] font-mono-data text-slate-500 italic">{step.preview_text}</div>
          <div className="flex justify-end">
            <button onClick={() => onCopy(`Subject: ${step.subject_line}\n\n${step.body}`)} className="text-slate-400 hover:text-slate-100"><Copy className="h-3.5 w-3.5" /></button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 rounded-md border border-slate-800 bg-slate-950 p-3">{step.body}</pre>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">CTA: {step.cta}</div>
            <div className="text-[10px] font-mono-data text-slate-500">{step.personalization_fields?.join(' · ')}</div>
          </div>
          <p className="text-[11px] text-slate-500 italic">Note: {step.notes_for_sender}</p>
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ObjectionCard({ obj, onCopy }: { obj: any; onCopy: (s: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-md border border-slate-800 bg-slate-800/40 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/60 text-left">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StatusPill tone="warn">{obj.category}</StatusPill>
          <span className="text-sm text-slate-100 italic truncate">&ldquo;{obj.objection_phrasing?.[0]}&rdquo;</span>
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 text-xs">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">How they might say it</div>
            <ul className="text-slate-300 space-y-0.5">
              {obj.objection_phrasing?.map((p: string, i: number) => <li key={i}>&ldquo;{p}&rdquo;</li>)}
            </ul>
          </div>
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Root Cause</div>
            <p className="text-slate-200 mt-0.5">{obj.root_cause}</p>
          </div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Response</div>
              <button onClick={() => onCopy(obj.response)} className="text-emerald-300 hover:text-emerald-100"><Copy className="h-3 w-3" /></button>
            </div>
            <p className="text-slate-100 italic">&ldquo;{obj.response}&rdquo;</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reframe</div><p className="text-slate-300 mt-0.5">{obj.reframe}</p></div>
            <div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Follow-up Q</div><p className="text-slate-300 mt-0.5 italic">&ldquo;{obj.follow_up_question}&rdquo;</p></div>
          </div>
          <div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Proof to cite</div><p className="text-slate-200 mt-0.5">{obj.proof_to_cite}</p></div>
        </div>
      )}
    </div>
  )
}
