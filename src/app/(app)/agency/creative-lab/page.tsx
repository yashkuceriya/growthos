'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { JsonView } from '@/components/ui/json-viewer'
import { FileText, Grid3x3, Video, Layout, Images, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = 'creative_brief' | 'testing_matrix' | 'video_script' | 'lp_wireframe' | 'ad_variant_pack'

const TOOLS: Array<{ key: Tool; label: string; icon: typeof FileText; desc: string; inputs: Array<{ name: string; label: string; kind: 'text' | 'textarea' | 'select'; options?: string[] }> }> = [
  { key: 'creative_brief', label: 'Creative Brief', icon: FileText, desc: 'BBDO-style single-minded proposition brief', inputs: [{ name: 'deliverable', label: 'Deliverable', kind: 'text' }] },
  { key: 'testing_matrix', label: 'Testing Matrix', icon: Grid3x3, desc: '4 hooks x 2 formats = 8 concepts with testing plan', inputs: [] },
  { key: 'video_script', label: 'Video Script', icon: Video, desc: 'Beat-by-beat script + shot list + storyboard image prompts', inputs: [{ name: 'format', label: 'Format', kind: 'select', options: ['short_9_16', 'reel_1_1', 'tutorial_16_9', 'explainer_16_9', 'testimonial'] }, { name: 'concept', label: 'Concept', kind: 'textarea' }] },
  { key: 'lp_wireframe', label: 'Landing Page Wireframe', icon: Layout, desc: 'Section order + copy blocks + above-fold checklist', inputs: [{ name: 'goal', label: 'Conversion Goal', kind: 'text' }] },
  { key: 'ad_variant_pack', label: 'Ad Variant Pack', icon: Images, desc: '6-10 ad variants ranked by testing priority', inputs: [] },
]

export default function CreativeLabPage() {
  const { activeProject } = useProject()
  const [tool, setTool] = useState<Tool>('creative_brief')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<unknown>(null)

  async function run() {
    if (!activeProject) return
    setRunning(true); setResult(null)
    try {
      const res = await fetch('/api/agency/creative-lab', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, tool, input: inputs }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setResult(json.result)
      toast.success('Done')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setRunning(false)
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  const currentTool = TOOLS.find((t) => t.key === tool)!

  return (
    <PageShell>
      <PageHeader title="Creative Lab" subtitle="Briefs, testing matrix, video scripts, landing page wireframes, ad variant packs." />

      <div className="grid grid-cols-5 gap-3 mb-4">
        {TOOLS.map((t) => {
          const Icon = t.icon
          const active = tool === t.key
          return (
            <button key={t.key} onClick={() => { setTool(t.key); setResult(null); setInputs({}) }} className={cn('text-left rounded-md border p-3 transition-all', active ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700')}>
              <div className="flex items-center justify-between mb-1">
                <Icon className={cn('h-4 w-4', active ? 'text-emerald-400' : 'text-slate-400')} />
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
          {currentTool.inputs.map((f) => (
            <div key={f.name}>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">{f.label}</label>
              {f.kind === 'textarea' ? (
                <textarea rows={3} value={inputs[f.name] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.name]: e.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none resize-none" />
              ) : f.kind === 'select' ? (
                <select value={inputs[f.name] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.name]: e.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                  <option value="">—</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              ) : (
                <input value={inputs[f.name] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.name]: e.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
              )}
            </div>
          ))}
          <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Generate'}
          </button>
        </div>
      </SectionPanel>

      {result !== null && (
        <SectionPanel title={`Result · ${currentTool.label}`}>
          <JsonView data={result} />
        </SectionPanel>
      )}
    </PageShell>
  )
}
