'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Newspaper, FileText, Send, MessageSquare, Mic, Award, Radar, Package, Loader2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = 'press_kit' | 'press_release' | 'journalist_pitch' | 'haro_reply' | 'podcast_pitch' | 'speaking_pitch' | 'award_pitch' | 'newsjacking'

const TOOLS: Array<{ key: Tool; label: string; icon: typeof Newspaper; desc: string; inputs: string[] }> = [
  { key: 'press_kit', label: 'Press Kit', icon: Package, desc: 'Full media kit: boilerplates, bios, FAQ, stats, guidelines', inputs: [] },
  { key: 'press_release', label: 'Press Release', icon: Newspaper, desc: 'AP-style release + target outlet list', inputs: ['angle'] },
  { key: 'journalist_pitch', label: 'Journalist Pitch', icon: Send, desc: 'Personalized pitch + 3-step follow-up sequence', inputs: ['outlet', 'reporter', 'recent_work', 'angle'] },
  { key: 'haro_reply', label: 'HARO / Qwoted Reply', icon: MessageSquare, desc: 'Reporter query → quotable, pickable reply', inputs: ['query'] },
  { key: 'podcast_pitch', label: 'Podcast Guest Pitch', icon: Mic, desc: 'Pitch yourself as a guest with topics, stories, sample questions', inputs: ['podcast', 'recent_episode'] },
  { key: 'speaking_pitch', label: 'Speaking Pitch', icon: FileText, desc: 'Conference talk pitch with abstract + outline', inputs: ['event', 'topic'] },
  { key: 'award_pitch', label: 'Awards Application', icon: Award, desc: 'Impact-led award application draft', inputs: ['award', 'category'] },
  { key: 'newsjacking', label: 'Newsjacking Framework', icon: Radar, desc: 'How to spot opportunities + ready response templates', inputs: [] },
]

export default function PRPage() {
  const { activeProject } = useProject()
  const [tool, setTool] = useState<Tool>('press_kit')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null)

  async function run() {
    if (!activeProject) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/agency/pr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, tool, input: inputs }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setResult(json.result)
      toast.success('PR asset ready')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setRunning(false)
  }

  function copyText(t: string) { navigator.clipboard.writeText(t); toast.success('Copied') }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  const currentTool = TOOLS.find((t) => t.key === tool)!

  return (
    <PageShell>
      <PageHeader title="PR / Media Suite" subtitle="Press kit, releases, journalist pitches, HARO, podcast/speaking, awards, newsjacking." />

      <div className="grid grid-cols-4 gap-3 mb-4">
        {TOOLS.map((t) => {
          const Icon = t.icon
          const active = tool === t.key
          return (
            <button key={t.key} onClick={() => { setTool(t.key); setResult(null); setInputs({}) }} className={cn(
              'text-left rounded-md border p-3 transition-all',
              active ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
            )}>
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

      <SectionPanel className="mb-4" title={currentTool.label}>
        <div className="space-y-2">
          {currentTool.inputs.map((field) => (
            <div key={field}>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">{field.replace(/_/g, ' ')}</label>
              {field === 'query' || field === 'recent_work' ? (
                <textarea rows={3} value={inputs[field] ?? ''} onChange={(e) => setInputs({ ...inputs, [field]: e.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none resize-none" />
              ) : (
                <input value={inputs[field] ?? ''} onChange={(e) => setInputs({ ...inputs, [field]: e.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
              )}
            </div>
          ))}
          <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Generate'}
          </button>
        </div>
      </SectionPanel>

      {result && <ResultPanel tool={tool} result={result} onCopy={copyText} />}
    </PageShell>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResultPanel({ tool, result, onCopy }: { tool: Tool; result: any; onCopy: (s: string) => void }) {
  if (tool === 'press_kit') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title="Boilerplates (Copy-Paste Ready)">
          {Object.entries(result.company_boilerplate ?? {}).map(([k, v]) => (
            <CopyBlock key={k} label={k.replace(/_/g, ' ')} text={v as string} onCopy={onCopy} />
          ))}
        </SectionPanel>

        <SectionPanel title="Product Facts">
          <dl className="space-y-1 text-xs">
            {Object.entries(result.product_facts ?? {}).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-slate-500 uppercase tracking-wider text-[10px] w-40 shrink-0">{k.replace(/_/g, ' ')}</dt>
                <dd className="text-slate-200">{Array.isArray(v) ? (v as string[]).join(' · ') : (v as string)}</dd>
              </div>
            ))}
          </dl>
        </SectionPanel>

        <SectionPanel title="Founder Bios">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.founder_bios?.map((b: any, i: number) => (
            <div key={i} className="mb-3 rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <StatusPill tone="accent">{b.role}</StatusPill>
                <span className="text-sm font-semibold text-slate-100">{b.name_placeholder}</span>
              </div>
              <CopyBlock label="Short (50 words)" text={b.short_bio_50} onCopy={onCopy} />
              <CopyBlock label="Long (150 words)" text={b.long_bio_150} onCopy={onCopy} />
            </div>
          ))}
        </SectionPanel>

        <SectionPanel title="Press-Friendly Stats">
          <ul className="space-y-2 text-xs">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.press_friendly_stats?.map((s: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-sm font-semibold text-emerald-300">{s.stat}</div>
                <p className="text-slate-300 mt-1">{s.context}</p>
                <p className="text-[10px] italic text-amber-400 mt-1">Verify: {s.source_needed}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel title="Reusable Quotes">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.quotes_for_reuse?.map((q: any, i: number) => (
              <li key={i} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-sm text-slate-100 italic">&ldquo;{q.quote}&rdquo;</p>
                <p className="text-xs text-slate-400 mt-1">— {q.attribution} · {q.context}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel title="Media Assets Checklist">
          <ul className="text-xs text-slate-200 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.media_assets_checklist?.map((a: string, i: number) => <li key={i}>☐ {a}</li>)}
          </ul>
        </SectionPanel>

        <SectionPanel title="Brand Guidelines (for journalists)">
          <dl className="space-y-2 text-xs">
            <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Logo Usage</dt><dd className="text-slate-200">{result.brand_guidelines_summary?.logo_usage}</dd></div>
            <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Color Palette</dt><dd className="text-slate-200">{result.brand_guidelines_summary?.color_palette_note}</dd></div>
            <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Voice</dt><dd className="text-slate-200">{result.brand_guidelines_summary?.tone_of_voice}</dd></div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">Avoid</dt>
              <ul className="text-slate-300 space-y-0.5 mt-1">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.brand_guidelines_summary?.things_to_avoid?.map((t: string, i: number) => <li key={i}>· {t}</li>)}
              </ul>
            </div>
          </dl>
        </SectionPanel>

        <SectionPanel title="FAQ for Press">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.faq_for_press?.map((f: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-xs font-semibold text-slate-100">Q: {f.q}</div>
                <p className="text-xs text-slate-300 mt-1">A: {f.a}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel title="Press Contact">
          <dl className="space-y-1 text-xs">
            {Object.entries(result.contact_block ?? {}).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-slate-500 uppercase tracking-wider text-[10px] w-48 shrink-0">{k.replace(/_/g, ' ')}</dt>
                <dd className="text-slate-200">{v as string}</dd>
              </div>
            ))}
          </dl>
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'press_release') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={result.headline}>
          <p className="text-[10px] font-mono-data text-slate-500 mb-2">{result.dateline}</p>
          <p className="text-sm font-semibold text-slate-300 mb-3">{result.subheadline}</p>
          <p className="text-sm text-slate-100 mb-3">{result.lede_paragraph}</p>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.body_paragraphs?.map((p: string, i: number) => <p key={i} className="text-sm text-slate-300 mb-2">{p}</p>)}
          <blockquote className="my-3 rounded-md border-l-2 border-emerald-500 bg-emerald-500/5 p-3 italic text-slate-100">
            &ldquo;{result.pull_quote?.quote}&rdquo;
            <footer className="mt-1 text-xs text-slate-400">— {result.pull_quote?.attribution}</footer>
          </blockquote>
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-800/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">About</div>
            <p className="text-xs text-slate-300">{result.company_boilerplate}</p>
          </div>
          <div className="mt-3 rounded-md border border-slate-800 bg-slate-800/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Media Contact</div>
            <p className="text-xs text-slate-300 whitespace-pre-line">{result.media_contact}</p>
          </div>
          <div className="mt-3">
            <button onClick={() => {
              const full = `${result.dateline}\n\n${result.headline}\n${result.subheadline}\n\n${result.lede_paragraph}\n\n${result.body_paragraphs.join('\n\n')}\n\n"${result.pull_quote.quote}" — ${result.pull_quote.attribution}\n\n${result.company_boilerplate}\n\n${result.media_contact}`
              onCopy(full)
            }} className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/80"><Copy className="h-3 w-3" /> Copy Full Release</button>
          </div>
        </SectionPanel>

        <SectionPanel title="Distribution Tips">
          <ul className="text-xs text-slate-200 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.distribution_tips?.map((t: string, i: number) => <li key={i}>· {t}</li>)}
          </ul>
        </SectionPanel>

        <SectionPanel title="Target Outlets">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.target_outlets?.map((o: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3 text-xs">
                <div className="text-sm font-semibold text-slate-100">{o.outlet}</div>
                <p className="text-slate-400 mt-1">Target: <span className="text-slate-300">{o.reporter_role_to_target}</span></p>
                <p className="text-emerald-300 mt-1 italic">Angle: {o.angle_to_pitch}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'journalist_pitch') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title="Pitch Email">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-mono-data">
            <span className="text-slate-500">Subject A:</span><span className="text-slate-200">{result.subject_line}</span>
          </div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-mono-data">
            <span className="text-slate-500">Subject B:</span><span className="text-slate-200">{result.subject_variant_b}</span>
          </div>
          <CopyBlock label="Full Email (ready to send)" text={result.full_email_draft} onCopy={onCopy} />
        </SectionPanel>

        <div className="grid grid-cols-2 gap-3">
          <SectionPanel title="Hook Opening"><p className="text-xs text-slate-200">{result.hook_opening}</p></SectionPanel>
          <SectionPanel title="Story Pitch"><p className="text-xs text-slate-200">{result.story_pitch}</p></SectionPanel>
          <SectionPanel title="Exclusive Angle"><p className="text-xs text-slate-200">{result.exclusive_angle}</p></SectionPanel>
          <SectionPanel title="CTA"><p className="text-xs text-slate-200">{result.call_to_action}</p></SectionPanel>
        </div>

        <SectionPanel title="Key Facts (for reporter)">
          <ul className="text-xs text-slate-200 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.key_facts?.map((f: string, i: number) => <li key={i}>· {f}</li>)}
          </ul>
        </SectionPanel>

        <SectionPanel title="Follow-Up Sequence">
          <CopyBlock label="Day 3 Follow-Up" text={result.follow_up_at_day_3} onCopy={onCopy} />
          <CopyBlock label="Day 7 Follow-Up" text={result.follow_up_at_day_7} onCopy={onCopy} />
          <CopyBlock label="Day 14 Break-Up" text={result.breakup_email_day_14} onCopy={onCopy} />
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'haro_reply') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`HARO Reply · Fit: ${result.confidence_level?.replace(/_/g, ' ')}`}>
          <CopyBlock label="Opening" text={result.opening} onCopy={onCopy} />
          <CopyBlock label="Answer Body" text={result.answer_body} onCopy={onCopy} />
          <CopyBlock label="Bio Line" text={result.bio_line} onCopy={onCopy} />
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Quotable One-Liner</div>
            <p className="text-sm text-slate-100 italic">&ldquo;{result.quotable_one_liner}&rdquo;</p>
          </div>
          <div className="mt-3"><CopyBlock label="Availability Block" text={result.availability_block} onCopy={onCopy} /></div>
          {result.attachments_recommendations?.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Attach</div>
              <ul className="text-xs text-slate-200 space-y-0.5">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.attachments_recommendations?.map((a: string, i: number) => <li key={i}>· {a}</li>)}
              </ul>
            </div>
          )}
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'podcast_pitch') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={result.target_podcast}>
          <CopyBlock label="Subject" text={result.subject_line} onCopy={onCopy} />
          <CopyBlock label="Full Email Draft" text={result.full_email_draft} onCopy={onCopy} />
        </SectionPanel>

        <SectionPanel title="Talk Track Topics">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.talk_track_topics?.map((t: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-sm font-semibold text-slate-100">{t.topic}</div>
                <p className="text-xs text-slate-300 mt-1">Angle: {t.angle}</p>
                <p className="text-xs text-emerald-300 mt-1">Story: &ldquo;{t.sample_story}&rdquo;</p>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-3">
          <SectionPanel title="Audience Value Prop"><p className="text-xs text-slate-200">{result.audience_value_prop}</p></SectionPanel>
          <SectionPanel title="Credibility Markers">
            <ul className="text-xs text-slate-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.credibility_markers?.map((c: string, i: number) => <li key={i}>· {c}</li>)}
            </ul>
          </SectionPanel>
        </div>

        <SectionPanel title="Sample Questions for the Host">
          <ol className="list-decimal list-inside text-sm text-slate-200 space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.sample_questions?.map((q: string, i: number) => <li key={i}>{q}</li>)}
          </ol>
        </SectionPanel>

        <CopyBlock label="Follow-Up If No Reply" text={result.follow_up_if_no_reply} onCopy={onCopy} />
      </div>
    )
  }

  if (tool === 'speaking_pitch') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={result.talk_title}>
          <p className="text-sm font-semibold text-slate-300 mb-3">{result.talk_subtitle}</p>
          <CopyBlock label="Abstract (150 words)" text={result.abstract_150} onCopy={onCopy} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.takeaways?.map((t: string, i: number) => (
              <div key={i} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Takeaway {i + 1}</div>
                <p className="text-xs text-slate-100 mt-1">{t}</p>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="Talk Outline">
          <ul className="space-y-1 text-xs">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.outline?.map((o: any, i: number) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono-data text-emerald-400 w-12 shrink-0">{o.time_minutes}min</span>
                <span className="text-slate-200 font-semibold w-48 shrink-0">{o.beat}</span>
                <span className="text-slate-400 flex-1">{o.key_insight}</span>
              </li>
            ))}
          </ul>
        </SectionPanel>

        <SectionPanel title="Speaker Bio">
          <CopyBlock label="" text={result.speaker_bio} onCopy={onCopy} />
        </SectionPanel>

        <CopyBlock label="Full Pitch Email" text={result.full_email_pitch} onCopy={onCopy} />
      </div>
    )
  }

  if (tool === 'award_pitch') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`${result.award_name} · ${result.category}`}>
          <CopyBlock label="Executive Summary (250 words)" text={result.executive_summary_250} onCopy={onCopy} />
          <CopyBlock label="Impact Story" text={result.impact_story} onCopy={onCopy} />
          <CopyBlock label="Differentiation" text={result.differentiation} onCopy={onCopy} />
        </SectionPanel>

        <SectionPanel title="Milestones to Cite">
          <ul className="text-xs text-slate-200 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.milestones_achieved?.map((m: string, i: number) => <li key={i}>· {m}</li>)}
          </ul>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-3">
          <SectionPanel title="Evidence to Gather">
            <ul className="text-xs text-slate-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.supporting_evidence_needed?.map((e: string, i: number) => <li key={i}>☐ {e}</li>)}
            </ul>
          </SectionPanel>
          <SectionPanel title="Press Mentions to Cite">
            <ul className="text-xs text-slate-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.press_mentions_to_cite?.map((p: string, i: number) => <li key={i}>· {p}</li>)}
            </ul>
          </SectionPanel>
        </div>

        <SectionPanel title="Testimonials to Request">
          <ul className="text-xs text-slate-200 space-y-0.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.customer_testimonials_to_request?.map((t: string, i: number) => <li key={i}>→ {t}</li>)}
          </ul>
        </SectionPanel>

        <SectionPanel title="Common Questions">
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.answers_to_common_questions?.map((q: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3 text-xs">
                <div className="font-semibold text-slate-100">Q: {q.q}</div>
                <p className="text-slate-300 mt-1">A: {q.a}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>
      </div>
    )
  }

  if (tool === 'newsjacking') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title="Scan Framework">
          <p className="text-sm text-slate-200">{result.scan_framework}</p>
        </SectionPanel>

        <SectionPanel title="Opportunity Types">
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.opportunity_types?.map((o: any, i: number) => (
              <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <StatusPill tone="accent">{o.type.replace(/_/g, ' ')}</StatusPill>
                  <span className="text-[10px] font-mono-data text-amber-400">respond within {o.response_time_window_hours}h</span>
                </div>
                <p className="text-xs text-slate-300 mb-2">{o.description}</p>
                <div className="text-[11px] text-slate-400">How: <span className="text-slate-200">{o.how_to_jump_in}</span></div>
                <div className="text-[11px] text-slate-400 mt-1">Channels: {o.channels_to_use?.join(' · ')}</div>
                <p className="mt-2 text-[11px] italic text-emerald-300">Example hook: &ldquo;{o.example_hook}&rdquo;</p>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="Ready Templates">
          <ul className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.templates?.map((t: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="text-xs font-semibold text-slate-100 mb-2">{t.trigger_scenario}</div>
                <CopyBlock label="Social Response" text={t.social_response} onCopy={onCopy} />
                <CopyBlock label="Reporter Pitch" text={t.reporter_pitch} onCopy={onCopy} />
                <CopyBlock label="Blog Angle" text={t.blog_angle} onCopy={onCopy} />
              </li>
            ))}
          </ul>
        </SectionPanel>

        <div className="grid grid-cols-2 gap-3">
          <SectionPanel title="Red Flags (don't newsjack)" className="border-rose-500/20">
            <ul className="text-xs text-rose-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.red_flags?.map((r: string, i: number) => <li key={i}>⚠ {r}</li>)}
            </ul>
          </SectionPanel>
          <SectionPanel title="Google Alerts Watchlist">
            <ul className="text-xs text-slate-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.current_watchlist?.map((w: string, i: number) => <li key={i}>· {w}</li>)}
            </ul>
          </SectionPanel>
        </div>
      </div>
    )
  }

  return null
}

function CopyBlock({ label, text, onCopy, className }: { label: string; text: string; onCopy: (s: string) => void; className?: string }) {
  return (
    <div className={cn('rounded-md border border-slate-800 bg-slate-950 p-3 mb-2', className)}>
      {label && <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">{label}</div>
        <button onClick={() => onCopy(text)} className="text-slate-400 hover:text-slate-100"><Copy className="h-3 w-3" /></button>
      </div>}
      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200">{text}</pre>
    </div>
  )
}
