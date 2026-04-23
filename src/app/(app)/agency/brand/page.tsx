'use client'

import { useState, useEffect } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Palette, Loader2, Check, X, Download } from 'lucide-react'
import { guidelinesToMarkdown } from '@/lib/brand-book-export'

export default function BrandHubPage() {
  const { activeProject } = useProject()
  const supabase = createClient()
  const [guidelines, setGuidelines] = useState<Record<string, unknown> | null>(null)
  const [generating, setGenerating] = useState(false)

  async function refresh() {
    if (!activeProject) return
    const { data } = await supabase.from('projects').select('brand_voice').eq('id', activeProject.id).single()
    const bv = (data?.brand_voice as Record<string, unknown>) ?? {}
    setGuidelines((bv.guidelines as Record<string, unknown> | undefined) ?? null)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProject?.id])

  function download() {
    if (!activeProject || !guidelines) return
    const md = guidelinesToMarkdown(activeProject.name, guidelines)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeSlug = activeProject.slug.replace(/[^a-z0-9-]/gi, '-')
    a.download = `${safeSlug}-brand-book.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Brand book downloaded')
  }

  async function generate() {
    if (!activeProject) return
    setGenerating(true)
    try {
      const res = await fetch('/api/agency/brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      toast.success('Brand book ready')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setGenerating(false)
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Brand Hub"
        subtitle="Voice, messaging, style guide — shared by all agents"
        actions={
          <div className="flex gap-2">
            {guidelines && (
              <button onClick={download} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
                <Download className="h-3.5 w-3.5" /> Export .md
              </button>
            )}
            <button onClick={generate} disabled={generating} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Palette className="h-3.5 w-3.5" />}
              {guidelines ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        }
      />

      {!guidelines ? (
        <SectionPanel>
          <div className="flex flex-col items-center py-12">
            <Palette className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No brand book yet. Click Generate.</p>
          </div>
        </SectionPanel>
      ) : (
        <div className="space-y-4">
          <SectionPanel title="Positioning">
            <p className="text-lg text-slate-100 font-medium mb-4">{guidelines.positioning_statement as string}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Mission</div>
                <p className="text-slate-300">{guidelines.mission as string}</p>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Vision</div>
                <p className="text-slate-300">{guidelines.vision as string}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Brand Values</div>
              <div className="flex flex-wrap gap-1.5">
                {(guidelines.brand_values as string[])?.map((v, i) => <StatusPill key={i} tone="accent">{v}</StatusPill>)}
              </div>
            </div>
          </SectionPanel>

          <SectionPanel title="Voice Traits">
            <div className="grid grid-cols-2 gap-4">
              {(guidelines.voice_traits as Array<Record<string, unknown>>)?.map((t, i) => (
                <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-emerald-300 uppercase">{t.trait as string}</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{t.description as string}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                        <Check className="h-3 w-3" /> We are
                      </div>
                      <ul className="space-y-0.5 text-[11px] text-slate-300">
                        {(t.we_are as string[])?.map((w, j) => <li key={j}>· {w}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                        <X className="h-3 w-3" /> We are not
                      </div>
                      <ul className="space-y-0.5 text-[11px] text-slate-300">
                        {(t.we_are_not as string[])?.map((w, j) => <li key={j}>· {w}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel title="Tone by Context">
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(guidelines.tone_by_context as Record<string, string>).map(([k, v]) => (
                <div key={k} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">{k}</div>
                  <p className="text-xs text-slate-300">{v}</p>
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel title="Messaging Matrix">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="px-2 py-2 text-left">Segment</th>
                  <th className="px-2 py-2 text-left">Pain</th>
                  <th className="px-2 py-2 text-left">Promise</th>
                  <th className="px-2 py-2 text-left">Proof</th>
                  <th className="px-2 py-2 text-left">CTA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {(guidelines.messaging_matrix as Array<Record<string, string>>)?.map((m, i) => (
                  <tr key={i}>
                    <td className="px-2 py-2 font-semibold text-slate-100">{m.audience_segment}</td>
                    <td className="px-2 py-2 text-slate-400">{m.pain_point}</td>
                    <td className="px-2 py-2 text-emerald-300">{m.promise}</td>
                    <td className="px-2 py-2 text-slate-300">{m.proof}</td>
                    <td className="px-2 py-2 text-slate-200"><StatusPill tone="accent">{m.cta}</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionPanel>

          <SectionPanel title="Taglines">
            <ul className="space-y-1 text-sm text-slate-200">
              {(guidelines.taglines as string[])?.map((t, i) => (
                <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 px-3 py-2 font-medium">
                  &ldquo;{t}&rdquo;
                </li>
              ))}
            </ul>
          </SectionPanel>

          <SectionPanel title="Elevator Pitches">
            <div className="space-y-3">
              {Object.entries(guidelines.elevator_pitches as Record<string, string>).map(([k, v]) => (
                <div key={k}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{k.replace(/_/g, ' ')}</div>
                  <p className="text-sm text-slate-200 italic rounded-md border border-slate-800 bg-slate-800/40 p-3">&ldquo;{v}&rdquo;</p>
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel title="Vocabulary">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  <Check className="h-3 w-3" /> Always use
                </div>
                <div className="flex flex-wrap gap-1">
                  {((guidelines.vocabulary as Record<string, string[]>)?.always_use as string[])?.map((w, i) => <StatusPill key={i} tone="success">{w}</StatusPill>)}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                  <X className="h-3 w-3" /> Never use
                </div>
                <div className="flex flex-wrap gap-1">
                  {((guidelines.vocabulary as Record<string, string[]>)?.never_use as string[])?.map((w, i) => <StatusPill key={i} tone="error">{w}</StatusPill>)}
                </div>
              </div>
            </div>
          </SectionPanel>

          <SectionPanel title="Brand Story">
            <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{guidelines.story as string}</p>
          </SectionPanel>
        </div>
      )}
    </PageShell>
  )
}
