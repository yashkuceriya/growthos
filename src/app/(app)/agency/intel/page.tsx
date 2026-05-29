'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Search, Loader2, Plus, Trash2 } from 'lucide-react'

export default function CompetitiveIntelPage() {
  const { activeProject } = useProject()
  const supabase = useMemo(() => createClient(), [])
  const activeProjectId = activeProject?.id ?? null
  const [intel, setIntel] = useState<Record<string, unknown> | null>(null)
  const [running, setRunning] = useState(false)
  const [urls, setUrls] = useState<string[]>([''])

  const refresh = useCallback(async () => {
    if (!activeProjectId) return
    const { data } = await supabase.from('projects').select('brand_voice').eq('id', activeProjectId).single()
    const bv = (data?.brand_voice as Record<string, unknown>) ?? {}
    setIntel((bv.competitive_intel as Record<string, unknown> | undefined) ?? null)
  }, [activeProjectId, supabase])

  useEffect(() => { void refresh() }, [refresh])

  async function runAnalysis() {
    if (!activeProject) return
    const cleaned = urls.filter((u) => u.trim().length > 0)
    if (cleaned.length === 0) { toast.error('Add at least one competitor URL'); return }
    setRunning(true)
    try {
      const res = await fetch('/api/agency/competitive-intel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, competitorUrls: cleaned }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      toast.success('Competitive intel ready')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setRunning(false)
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  return (
    <PageShell>
      <PageHeader title="Competitive Intel" subtitle="Analyze competitor positioning — find gaps you can own" />

      <SectionPanel className="mb-4" title="Add Competitors">
        <div className="space-y-2">
          {urls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="url" placeholder="https://competitor.com"
                value={url}
                onChange={(e) => setUrls((prev) => prev.map((u, j) => j === i ? e.target.value : u))}
                className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              {urls.length > 1 && (
                <button onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))} className="rounded-md border border-slate-700 bg-slate-800 px-2 text-slate-400 hover:text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            {urls.length < 5 && (
              <button onClick={() => setUrls((prev) => [...prev, ''])} className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/80">
                <Plus className="h-3.5 w-3.5" /> Add Another
              </button>
            )}
            <button onClick={runAnalysis} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {running ? 'Analyzing…' : 'Run Analysis'}
            </button>
          </div>
        </div>
      </SectionPanel>

      {intel && (
        <div className="space-y-4">
          <SectionPanel className="border-emerald-500/30" title="Recommended Positioning">
            <p className="text-base text-slate-100 font-medium">{intel.recommended_positioning as string}</p>
          </SectionPanel>

          <SectionPanel title="Competitor Teardowns">
            <div className="space-y-3">
              {(intel.competitors as Array<Record<string, unknown>>)?.map((c, i) => (
                <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-base font-semibold text-slate-100">{c.name as string}</h3>
                    <StatusPill tone="neutral">{c.pricing_model as string}</StatusPill>
                  </div>
                  <p className="text-sm text-slate-300 mb-3">{c.positioning as string}</p>
                  <div className="text-xs text-slate-400 mb-3">Hook: <span className="italic">{c.their_hook as string}</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Strengths</div>
                      <ul className="space-y-0.5 text-[11px] text-slate-300">
                        {(c.strengths as string[])?.map((s, j) => <li key={j}>· {s}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400 mb-1">Weaknesses</div>
                      <ul className="space-y-0.5 text-[11px] text-slate-300">
                        {(c.weaknesses as string[])?.map((w, j) => <li key={j}>· {w}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel title="Market Gaps" className="border-emerald-500/20">
            <ul className="space-y-2">
              {(intel.market_gaps as string[])?.map((g, i) => (
                <li key={i} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200">{g}</li>
              ))}
            </ul>
          </SectionPanel>

          <SectionPanel title="5 Differentiation Angles">
            <ol className="space-y-1 text-sm text-slate-200">
              {(intel.differentiation_angles as string[])?.map((a, i) => (
                <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 px-3 py-2">
                  <span className="font-mono-data text-emerald-400 mr-2">{i + 1}.</span>
                  {a}
                </li>
              ))}
            </ol>
          </SectionPanel>

          <SectionPanel title="Threat Assessment" className="border-rose-500/20">
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">Biggest Threat</span>
                <p className="mt-1 text-slate-100 font-semibold">{(intel.threat_assessment as Record<string, string>)?.biggest_threat}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Why</span>
                <p className="mt-1 text-slate-300">{(intel.threat_assessment as Record<string, string>)?.why}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Counter-Strategy</span>
                <p className="mt-1 text-slate-200">{(intel.threat_assessment as Record<string, string>)?.counter_strategy}</p>
              </div>
            </div>
          </SectionPanel>

          <SectionPanel title="Content Gaps (Topics Competitors Miss)">
            <div className="flex flex-wrap gap-1.5">
              {(intel.content_gaps as string[])?.map((g, i) => <StatusPill key={i} tone="info">{g}</StatusPill>)}
            </div>
          </SectionPanel>
        </div>
      )}
    </PageShell>
  )
}
