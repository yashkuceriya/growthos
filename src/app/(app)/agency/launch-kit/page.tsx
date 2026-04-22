'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Rocket, Loader2, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Kit = 'master_plan' | 'product_hunt' | 'show_hn' | 'indie_hackers' | 'betalist'

const KITS: Array<{ key: Kit; label: string; desc: string; note: string }> = [
  { key: 'master_plan', label: 'Master Launch Plan', desc: 'Which platforms, in what order, with full timeline', note: 'Start here — plan everything else around this' },
  { key: 'product_hunt', label: 'Product Hunt Kit', desc: 'Taglines, maker comment, hunter DM, 7-day timeline', note: 'Best for consumer / SaaS / dev tools / AI' },
  { key: 'show_hn', label: 'Show HN Kit', desc: 'Title formulas, body, opening comment, likely questions', note: 'Best for dev tools, technical products, open source' },
  { key: 'indie_hackers', label: 'Indie Hackers Kit', desc: '3 post variants, product page, milestone schedule', note: 'Best for solo founders, bootstrappers' },
  { key: 'betalist', label: 'BetaList / Waitlist Kit', desc: 'Submission copy + waitlist email sequence', note: 'Best for pre-launch products building anticipation' },
]

export default function LaunchKitPage() {
  const { activeProject } = useProject()
  const [kit, setKit] = useState<Kit>('master_plan')
  const [hunterName, setHunterName] = useState('')
  const [launchDate, setLaunchDate] = useState('')
  const [running, setRunning] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null)

  async function run() {
    if (!activeProject) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/agency/launch-kit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, kit, hunterName: hunterName || undefined, launchDate: launchDate || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setResult(json.result)
      toast.success('Launch kit ready')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setRunning(false)
  }

  function copyText(t: string) { navigator.clipboard.writeText(t); toast.success('Copied') }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  return (
    <PageShell>
      <PageHeader title="Launch Library" subtitle="Launch day kits — Product Hunt, Show HN, Indie Hackers, BetaList. Start with the master plan." />

      <div className="grid grid-cols-5 gap-3 mb-4">
        {KITS.map((k) => {
          const active = kit === k.key
          return (
            <button key={k.key} onClick={() => { setKit(k.key); setResult(null) }} className={cn(
              'text-left rounded-md border p-3 transition-all',
              active ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
            )}>
              <div className="flex items-center justify-between mb-1">
                <Rocket className={cn('h-4 w-4', active ? 'text-emerald-400' : 'text-slate-400')} />
                {active && <StatusPill tone="accent">Active</StatusPill>}
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{k.label}</h3>
              <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">{k.desc}</p>
              <p className="mt-2 text-[10px] text-slate-500 italic">{k.note}</p>
            </button>
          )
        })}
      </div>

      <SectionPanel className="mb-4" title={KITS.find((k) => k.key === kit)!.label}>
        <div className="space-y-2">
          {kit === 'product_hunt' && (
            <>
              <input value={hunterName} onChange={(e) => setHunterName(e.target.value)} placeholder="Hunter name (optional — if you have one lined up)" className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
              <input type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
            </>
          )}
          <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            {running ? 'Building Kit…' : 'Generate Kit'}
          </button>
        </div>
      </SectionPanel>

      {result && <KitResult kit={kit} result={result} onCopy={copyText} />}
    </PageShell>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KitResult({ kit, result, onCopy }: { kit: Kit; result: any; onCopy: (s: string) => void }) {
  if (kit === 'master_plan') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title="Launch Thesis">
          <p className="text-sm text-slate-200">{result.launch_thesis}</p>
        </SectionPanel>

        <SectionPanel title="Launch Stack Priority">
          <ol className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.launch_stack_priority?.map((p: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <StatusPill tone="accent">#{p.priority}</StatusPill>
                  <span className="text-sm font-semibold text-slate-100">{p.platform.replace(/_/g, ' ')}</span>
                  <StatusPill tone="neutral">{p.timing_relative}</StatusPill>
                </div>
                <p className="text-xs text-slate-400">{p.rationale}</p>
              </li>
            ))}
          </ol>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-4">
          <SectionPanel title="Pre-Launch Timeline">
            <ul className="space-y-1 text-xs">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.pre_launch_timeline?.map((t: any, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono-data text-emerald-400 w-10 shrink-0">T-{t.days_before}</span>
                  <span className="text-slate-200 flex-1">{t.task}</span>
                  <span className="text-[10px] text-slate-500">{t.owner}</span>
                </li>
              ))}
            </ul>
          </SectionPanel>

          <SectionPanel title="Launch Day Timeline">
            <ul className="space-y-1 text-xs">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.launch_day_timeline?.map((t: any, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono-data text-emerald-400 w-16 shrink-0">{t.hour}</span>
                  <span className="text-slate-200">{t.task}</span>
                </li>
              ))}
            </ul>
          </SectionPanel>
        </div>

        <SectionPanel title="Post-Launch Week">
          <div className="grid grid-cols-7 gap-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.post_launch_week_plan?.map((d: any, i: number) => (
              <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-2 text-xs">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Day {d.day}</div>
                <p className="mt-1 text-slate-300">{d.task}</p>
              </div>
            ))}
          </div>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-4">
          <SectionPanel title="Success Metrics" className="border-emerald-500/20">
            <div className="mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Real (what matters)</div>
              <ul className="text-xs text-slate-200 space-y-0.5">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.success_metrics?.real?.map((m: string, i: number) => <li key={i}>· {m}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Vanity (noise)</div>
              <ul className="text-xs text-slate-400 space-y-0.5">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.success_metrics?.vanity?.map((m: string, i: number) => <li key={i}>· {m}</li>)}
              </ul>
            </div>
          </SectionPanel>
          <SectionPanel title="Pitfalls to Avoid" className="border-rose-500/20">
            <ul className="text-xs text-rose-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.common_pitfalls?.map((p: string, i: number) => <li key={i}>⚠ {p}</li>)}
            </ul>
          </SectionPanel>
        </div>
      </div>
    )
  }

  if (kit === 'product_hunt') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`Product Hunt Kit · ${result.launch_date_tip}`}>
          <div className="mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">5 Tagline Options</div>
            <ul className="space-y-1">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.taglines?.map((t: string, i: number) => (
                <li key={i} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-800/40 px-3 py-2">
                  <span className="text-sm text-slate-100">&ldquo;{t}&rdquo;</span>
                  <button onClick={() => onCopy(t)} className="text-slate-400 hover:text-slate-100"><Copy className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </div>
          <CopyBlock label="Short Description (260 chars)" text={result.description_short} onCopy={onCopy} />
          <CopyBlock label="Long Description" text={result.description_long} onCopy={onCopy} />
          <CopyBlock label="First Maker Comment" text={result.first_maker_comment} onCopy={onCopy} className="border-emerald-500/30" />
        </SectionPanel>

        <SectionPanel title="Gallery Shots Plan">
          <ol className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.gallery_shots_plan?.map((s: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-sm font-semibold text-slate-100">{i + 1}. {s.name}</div>
                <p className="text-xs text-slate-400 mt-1">{s.description}</p>
                <p className="text-[10px] font-mono-data text-emerald-400 mt-1 italic">AI prompt: {s.prompt_for_ai_image}</p>
              </li>
            ))}
          </ol>
        </SectionPanel>

        <SectionPanel title="Outreach Templates">
          <div className="space-y-3">
            <CopyBlock label="Hunter DM" text={result.hunter_pitch_dm} onCopy={onCopy} />
            <CopyBlock label="Supporter Pre-Launch DM" text={result.supporter_outreach_dm} onCopy={onCopy} />
            <CopyBlock label="Supporter Launch Day DM" text={result.launch_day_outreach_dm} onCopy={onCopy} />
            <CopyBlock label="Post-Launch Thank You" text={result.post_launch_followup} onCopy={onCopy} />
          </div>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-4">
          <SectionPanel title="Pre-Launch Checklist">
            <ul className="space-y-1 text-xs">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.pre_launch_checklist?.map((t: string, i: number) => <li key={i} className="flex gap-2 text-slate-200">☐ {t}</li>)}
            </ul>
          </SectionPanel>
          <SectionPanel title="Launch Day Schedule (PST)">
            <ul className="space-y-1 text-xs">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.launch_day_schedule?.map((s: any, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono-data text-emerald-400 w-12 shrink-0">{s.hour_pst}</span>
                  <span className="text-slate-200">{s.action}</span>
                </li>
              ))}
            </ul>
          </SectionPanel>
        </div>

        <SectionPanel title="Engagement Responses (pre-drafted)">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.engagement_responses?.map((e: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-xs font-semibold text-slate-100 mb-1">{e.scenario}</div>
                <p className="text-xs text-slate-300 italic">&ldquo;{e.response}&rdquo;</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel title="FAQ">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.faq?.map((f: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-xs font-semibold text-slate-100">Q: {f.q}</div>
                <p className="text-xs text-slate-300 mt-1">A: {f.a}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>
      </div>
    )
  }

  if (kit === 'show_hn') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`Show HN · ${result.best_time}`}>
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">3 Title Options</div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.title_formulas?.map((t: any, i: number) => (
              <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-sm font-semibold text-slate-100 font-mono-data">{t.title}</p>
                  <button onClick={() => onCopy(t.title)} className="text-slate-400 hover:text-slate-100 shrink-0"><Copy className="h-3.5 w-3.5" /></button>
                </div>
                <p className="text-[11px] text-slate-500 italic">{t.rationale}</p>
              </div>
            ))}
          </div>
        </SectionPanel>

        <CopyBlock label="Post Body" text={result.body} onCopy={onCopy} asSection />
        <CopyBlock label="Opening Comment (pin yourself)" text={result.opening_comment} onCopy={onCopy} asSection className="border-emerald-500/30" />

        <SectionPanel title="Technical Talking Points">
          <ul className="text-xs text-slate-200 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.technical_details?.map((t: string, i: number) => <li key={i}>· {t}</li>)}
          </ul>
        </SectionPanel>

        <SectionPanel title="Likely Questions (pre-draft your answers)">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.likely_questions?.map((q: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-xs font-semibold text-slate-100">Q: {q.q}</div>
                <p className="text-xs text-slate-300 mt-1">A: {q.answer}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-4">
          <SectionPanel title="Toxic Patterns to Avoid" className="border-rose-500/20">
            <ul className="text-xs text-rose-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.toxic_patterns_to_avoid?.map((p: string, i: number) => <li key={i}>⚠ {p}</li>)}
            </ul>
          </SectionPanel>
          <SectionPanel title="Watch For (success signals)">
            <ul className="text-xs text-emerald-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.success_signals?.map((s: string, i: number) => <li key={i}>✓ {s}</li>)}
            </ul>
          </SectionPanel>
        </div>

        <SectionPanel title="If Post Stalls">
          <p className="text-sm text-slate-200">{result.fallback_if_no_traction}</p>
        </SectionPanel>
      </div>
    )
  }

  if (kit === 'indie_hackers') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title="3 Post Variants">
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.post_types?.map((p: any, i: number) => (
              <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <StatusPill tone="accent">{p.type}</StatusPill>
                  <StatusPill tone="neutral">{p.ideal_tag}</StatusPill>
                </div>
                <h3 className="text-sm font-semibold text-slate-100 mb-1">{p.title}</h3>
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 mt-2 rounded-md bg-slate-950 p-3 border border-slate-800">{p.body}</pre>
                <button onClick={() => onCopy(`${p.title}\n\n${p.body}`)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-100">
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="Product Page Copy">
          <dl className="space-y-2 text-sm">
            {Object.entries(result.product_page_copy ?? {}).map(([k, v]) => (
              <div key={k} className="rounded-md border border-slate-800 bg-slate-800/40 p-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.replace(/_/g, ' ')}</dt>
                <dd className="text-slate-200 mt-0.5">{v as string}</dd>
              </div>
            ))}
          </dl>
        </SectionPanel>

        <SectionPanel title="Response Templates">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.response_templates?.map((r: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3 text-xs">
                <div className="font-semibold text-slate-100">{r.comment_type}</div>
                <p className="text-slate-300 mt-1 italic">&ldquo;{r.response}&rdquo;</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel title="Milestone Post Schedule">
          <ul className="space-y-1 text-xs">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.milestone_schedule?.map((m: any, i: number) => (
              <li key={i} className="flex gap-2">
                <StatusPill tone="accent">{m.revenue_or_metric}</StatusPill>
                <span className="text-slate-200">{m.post_idea}</span>
              </li>
            ))}
          </ul>
        </SectionPanel>
      </div>
    )
  }

  if (kit === 'betalist') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title="BetaList / Waitlist Kit">
          <CopyBlock label={`Tagline (${result.tagline?.length}/60)`} text={result.tagline} onCopy={onCopy} />
          <CopyBlock label="Short Description (300 chars)" text={result.description_short} onCopy={onCopy} />
          <CopyBlock label="Long Description" text={result.description_long} onCopy={onCopy} />
          <CopyBlock label="Founder Note" text={result.founder_note} onCopy={onCopy} />
          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Key Features</div>
            <ul className="text-xs text-slate-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.key_features?.map((f: string, i: number) => <li key={i}>· {f}</li>)}
            </ul>
          </div>
          <div className="mt-3">
            <StatusPill tone="accent">Category: {result.category}</StatusPill>
          </div>
        </SectionPanel>

        <SectionPanel title="Submission Tips">
          <ul className="text-xs text-slate-200 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.submission_tips?.map((t: string, i: number) => <li key={i}>· {t}</li>)}
          </ul>
        </SectionPanel>

        <SectionPanel title="Waitlist Confirmation Email">
          <div className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Subject</div>
            <p className="text-sm font-semibold text-slate-100 mb-2">{result.waitlist_email_confirmation?.subject}</p>
            <CopyBlock label="Body" text={result.waitlist_email_confirmation?.body ?? ''} onCopy={onCopy} />
          </div>
        </SectionPanel>

        <SectionPanel title="Waitlist Follow-Up Sequence">
          <ul className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.waitlist_follow_up_sequence?.map((f: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <StatusPill tone="accent">Day {f.day}</StatusPill>
                  <span className="text-sm font-semibold text-slate-100">{f.subject}</span>
                </div>
                <p className="text-[11px] text-slate-500 italic mb-2">Purpose: {f.purpose}</p>
                <CopyBlock label="" text={f.body} onCopy={onCopy} />
              </li>
            ))}
          </ul>
        </SectionPanel>
      </div>
    )
  }

  return null
}

function CopyBlock({ label, text, onCopy, className, asSection }: { label: string; text: string; onCopy: (s: string) => void; className?: string; asSection?: boolean }) {
  const body = (
    <>
      {label && <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">{label}</div>}
      <div className="flex justify-end mb-1">
        <button onClick={() => onCopy(text)} className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-100">
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200">{text}</pre>
    </>
  )
  if (asSection) {
    return <SectionPanel className={className}>{body}</SectionPanel>
  }
  return (
    <div className={cn('rounded-md border border-slate-800 bg-slate-800/40 p-3', className)}>
      {body}
    </div>
  )
}
