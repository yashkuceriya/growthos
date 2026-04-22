'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { JsonView } from '@/components/ui/json-viewer'
import { Users, GitBranch, MessagesSquare, Camera, Award, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = 'referral' | 'affiliate' | 'community' | 'ugc' | 'ambassador'

const TOOLS: Array<{ key: Tool; label: string; icon: typeof Users; desc: string }> = [
  { key: 'referral', label: 'Referral Program', icon: GitBranch, desc: 'K-factor model, double-sided mechanic, copy suite, launch plan' },
  { key: 'affiliate', label: 'Affiliate Program', icon: Award, desc: 'Tiered partner program, outreach pack, tracking setup' },
  { key: 'community', label: 'Community Flywheel', icon: MessagesSquare, desc: 'Platform, channels, seed content, rituals, growth tactics' },
  { key: 'ugc', label: 'UGC Campaign', icon: Camera, desc: 'Prompt brief, hashtag, amplification plan, legal release' },
  { key: 'ambassador', label: 'Ambassador Program', icon: Users, desc: '12-month content calendar, toolkit, measurement per ambassador' },
]

export default function GrowthLoopsPage() {
  const { activeProject } = useProject()
  const [tool, setTool] = useState<Tool>('referral')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<unknown>(null)

  async function run() {
    if (!activeProject) return
    setRunning(true); setResult(null)
    try {
      const res = await fetch('/api/agency/growth-loops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, tool }),
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
      <PageHeader title="Growth Loops" subtitle="Referral, affiliate, community, UGC, ambassador — self-reinforcing acquisition." />

      <div className="grid grid-cols-5 gap-3 mb-4">
        {TOOLS.map((t) => {
          const Icon = t.icon
          const active = tool === t.key
          return (
            <button key={t.key} onClick={() => { setTool(t.key); setResult(null) }} className={cn('text-left rounded-md border p-3 transition-all', active ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700')}>
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
        <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Generate Program'}
        </button>
      </SectionPanel>

      {result !== null && (
        <SectionPanel title={`Result · ${currentTool.label}`}>
          <JsonView data={result} />
        </SectionPanel>
      )}
    </PageShell>
  )
}
