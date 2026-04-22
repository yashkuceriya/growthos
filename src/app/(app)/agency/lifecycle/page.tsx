'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Mail, Loader2, Copy, ChevronDown, ChevronRight, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Email = any

export default function LifecyclePage() {
  const { activeProject } = useProject()
  const [running, setRunning] = useState(false)
  const [persist, setPersist] = useState(true)
  const [result, setResult] = useState<{ vertical?: string; emails: Email[]; stages_planned: { id: string; label: string; category: string; trigger: string }[] } | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const [showHtml, setShowHtml] = useState<number | null>(null)

  async function run() {
    if (!activeProject) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/agency/lifecycle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, persist }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setResult(json)
      toast.success(`${json.emails.length} lifecycle emails generated${persist ? ' & saved' : ''}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setRunning(false)
  }

  function copyText(t: string) { navigator.clipboard.writeText(t); toast.success('Copied') }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  const categoryColor: Record<string, 'success' | 'warn' | 'info' | 'accent' | 'neutral'> = {
    onboarding: 'accent', activation: 'info', retention: 'success',
    expansion: 'warn', winback: 'neutral', transactional: 'neutral',
    newsletter: 'info', survey: 'neutral',
  }

  return (
    <PageShell>
      <PageHeader title="Email Lifecycle" subtitle="Generate every email in your lifecycle — onboarding, activation, retention, winback, transactional — tuned to your vertical." />

      <SectionPanel className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300 mb-1">Generate the full coordinated email set for <span className="font-semibold text-emerald-300">{activeProject.name}</span>.</p>
            <p className="text-xs text-slate-500">Stages are selected from the playbook for your vertical. Tone and narrative are consistent across all emails.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} className="accent-emerald-500" />
              Save as templates
            </label>
            <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {running ? 'Generating…' : 'Generate Full Lifecycle'}
            </button>
          </div>
        </div>
      </SectionPanel>

      {result && (
        <>
          <SectionPanel className="mb-4" title={`Lifecycle Plan · ${result.vertical ?? 'generic'}`}>
            <div className="flex flex-wrap gap-1.5">
              {result.stages_planned.map((s, i) => (
                <StatusPill key={i} tone={categoryColor[s.category] ?? 'neutral'}>{s.label}</StatusPill>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">{result.stages_planned.length} emails · coordinated voice · per-stage tone shift · ready to schedule in your ESP</p>
          </SectionPanel>

          <div className="space-y-2">
            {result.emails.map((email, i) => {
              const stage = result.stages_planned[i]
              const open = openIndex === i
              return (
                <div key={i} className="rounded-md border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <button onClick={() => setOpenIndex(open ? null : i)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-mono-data text-[10px] text-slate-500 w-6">{String(i + 1).padStart(2, '0')}</span>
                      {stage && <StatusPill tone={categoryColor[stage.category] ?? 'neutral'}>{stage.label}</StatusPill>}
                      <span className="text-sm font-semibold text-slate-100 truncate">{email.subject_a}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-data text-[10px] text-slate-500">+{email.send_rules?.delay_hours ?? 0}h</span>
                      {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-slate-800 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Subject A</div>
                          <p className="text-sm text-slate-100 font-medium mt-0.5">{email.subject_a}</p>
                        </div>
                        <div className="rounded-md border border-slate-800 bg-slate-800/40 p-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Subject B (A/B)</div>
                          <p className="text-sm text-slate-200 mt-0.5">{email.subject_b}</p>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Preview</div>
                        <p className="mt-0.5 text-xs text-slate-400 italic">{email.preview_text}</p>
                      </div>

                      <div className="flex gap-2 mb-1">
                        <button onClick={() => copyText(`Subject: ${email.subject_a}\n\n${email.body_plain_text}`)} className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/80">
                          <Copy className="h-3 w-3" /> Copy plain
                        </button>
                        <button onClick={() => copyText(email.body_html)} className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/80">
                          <Copy className="h-3 w-3" /> Copy HTML
                        </button>
                        <button onClick={() => setShowHtml(showHtml === i ? null : i)} className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/80">
                          <Eye className="h-3 w-3" /> {showHtml === i ? 'Show Plain' : 'Preview HTML'}
                        </button>
                      </div>

                      <div className="rounded-md border border-slate-800 bg-slate-950 p-3 max-h-80 overflow-y-auto">
                        {showHtml === i ? (
                          <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: email.body_html }} />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200">{email.body_plain_text}</pre>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">CTA</div>
                          <p className="text-sm text-slate-100 font-semibold mt-0.5">{email.cta_text}</p>
                          <p className="text-[10px] font-mono-data text-slate-500 mt-0.5 break-all">{email.cta_url}</p>
                        </div>
                        <div className="rounded-md border border-slate-800 bg-slate-800/40 p-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Personalization</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {email.personalization?.map((p: string, j: number) => <span key={j} className="font-mono-data text-[10px] rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{p}</span>)}
                          </div>
                        </div>
                      </div>

                      {email.send_rules && (
                        <div className="rounded-md border border-slate-800 bg-slate-800/40 p-2 text-[11px] text-slate-300">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Send Rules</div>
                          <div className="grid grid-cols-2 gap-1">
                            <div><span className="text-slate-500">Trigger:</span> {email.send_rules.trigger}</div>
                            <div><span className="text-slate-500">Delay:</span> {email.send_rules.delay_hours}h</div>
                            <div><span className="text-slate-500">Skip if:</span> {email.send_rules.skip_if}</div>
                            <div><span className="text-slate-500">Send time:</span> {email.send_rules.send_time_tip}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </PageShell>
  )
}
