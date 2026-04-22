'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Search, Network, GitCompare, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = 'keywords' | 'cluster' | 'comparison'

export default function SEOCommandCenter() {
  const { activeProject } = useProject()
  const [tool, setTool] = useState<Tool>('keywords')

  const [seed, setSeed] = useState('')
  const [pillar, setPillar] = useState('')
  const [competitors, setCompetitors] = useState('')
  const [running, setRunning] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [kwResult, setKwResult] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [clusterResult, setClusterResult] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [comparisonResult, setComparisonResult] = useState<any>(null)

  async function runKeywords() {
    if (!activeProject || !seed) return
    setRunning(true)
    try {
      const res = await fetch('/api/agency/seo/keywords', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, seedKeyword: seed }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setKwResult(await res.json())
      toast.success('Keyword research done')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setRunning(false)
  }

  async function runCluster() {
    if (!activeProject || !pillar) return
    setRunning(true)
    try {
      const res = await fetch('/api/agency/seo/cluster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, pillarKeyword: pillar }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setClusterResult(await res.json())
      toast.success('Cluster plan ready')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setRunning(false)
  }

  async function runComparisons() {
    if (!activeProject || !competitors) return
    setRunning(true)
    try {
      const list = competitors.split(',').map((c) => c.trim()).filter(Boolean)
      const res = await fetch('/api/agency/seo/comparison', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, competitors: list }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setComparisonResult(await res.json())
      toast.success('Comparison pages created and saved as drafts')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setRunning(false)
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  const tools: Array<{ key: Tool; label: string; icon: typeof Search; desc: string }> = [
    { key: 'keywords', label: 'Keyword Research', icon: Search, desc: '15-25 targets with volume, difficulty, intent' },
    { key: 'cluster', label: 'Content Cluster', icon: Network, desc: 'Pillar + 10 supporting articles + link map + 8-week plan' },
    { key: 'comparison', label: 'Comparison Pages', icon: GitCompare, desc: '"vs Competitor" pages — auto-saved as drafts' },
  ]

  return (
    <PageShell>
      <PageHeader title="SEO Command Center" subtitle="Real SEO tools — keywords, clusters, comparison pages" />

      <div className="mb-4 flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5 w-fit">
        {tools.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider',
                tool === t.key ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tool === 'keywords' && (
        <>
          <SectionPanel className="mb-4" title="Keyword Research">
            <div className="flex gap-2">
              <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Seed keyword (e.g. job application tracker)" className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
              <button onClick={runKeywords} disabled={running || !seed} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Research'}
              </button>
            </div>
          </SectionPanel>

          {kwResult && (
            <SectionPanel title={`Keywords for "${kwResult.seed}"`} contentClassName="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="px-3 py-2 text-left">Keyword</th>
                    <th className="px-3 py-2 text-left">Intent</th>
                    <th className="px-3 py-2 text-left">Stage</th>
                    <th className="px-3 py-2 text-right">Volume</th>
                    <th className="px-3 py-2 text-right">Difficulty</th>
                    <th className="px-3 py-2 text-center">Priority</th>
                    <th className="px-3 py-2 text-left">Content</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {kwResult.keywords.map((k: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-mono-data text-slate-200">{k.keyword}</td>
                      <td className="px-3 py-2"><StatusPill tone="neutral">{k.intent}</StatusPill></td>
                      <td className="px-3 py-2 text-slate-400">{k.funnel_stage}</td>
                      <td className="px-3 py-2 text-right font-mono-data text-emerald-300">{k.est_monthly_volume.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono-data text-slate-300">{k.est_difficulty_0_100}</td>
                      <td className="px-3 py-2 text-center"><StatusPill tone={k.priority_score >= 8 ? 'success' : k.priority_score >= 5 ? 'warn' : 'neutral'}>{k.priority_score}</StatusPill></td>
                      <td className="px-3 py-2 text-slate-400">{k.content_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionPanel>
          )}
        </>
      )}

      {tool === 'cluster' && (
        <>
          <SectionPanel className="mb-4" title="Content Cluster Builder">
            <div className="flex gap-2">
              <input value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="Pillar keyword (e.g. job search strategy)" className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
              <button onClick={runCluster} disabled={running || !pillar} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Build Cluster'}
              </button>
            </div>
          </SectionPanel>

          {clusterResult && (
            <div className="space-y-4">
              <SectionPanel className="border-emerald-500/30" title="Pillar Page">
                <h3 className="text-base font-semibold text-slate-100 mb-2">{clusterResult.pillar.title}</h3>
                <div className="flex gap-2 mb-3">
                  <StatusPill tone="accent">{clusterResult.pillar.target_keyword}</StatusPill>
                  <StatusPill tone="neutral">{clusterResult.pillar.target_word_count} words</StatusPill>
                </div>
                <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
                  {clusterResult.pillar.outline.map((o: string, i: number) => <li key={i}>{o}</li>)}
                </ul>
              </SectionPanel>

              <SectionPanel title="10 Supporting Articles">
                <div className="grid grid-cols-2 gap-3">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {clusterResult.supporting_articles.map((a: any, i: number) => (
                    <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                      <h4 className="text-sm font-semibold text-slate-100 mb-1">{a.title}</h4>
                      <div className="flex gap-1 mb-2">
                        <StatusPill tone="neutral">{a.target_keyword}</StatusPill>
                        <StatusPill tone="info">{a.search_intent}</StatusPill>
                        <StatusPill tone="neutral">{a.target_word_count}w</StatusPill>
                      </div>
                      <p className="text-[11px] text-slate-400">{a.hook_paragraph}</p>
                    </div>
                  ))}
                </div>
              </SectionPanel>

              <SectionPanel title="8-Week Publishing Cadence">
                <div className="grid grid-cols-4 gap-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {clusterResult.publishing_cadence.map((w: any, i: number) => (
                    <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Week {w.week}</div>
                      <ul className="text-[11px] text-slate-300 space-y-0.5">
                        {w.publish.map((p: string, j: number) => <li key={j}>· {p}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </SectionPanel>
            </div>
          )}
        </>
      )}

      {tool === 'comparison' && (
        <>
          <SectionPanel className="mb-4" title="Comparison Page Generator">
            <p className="text-xs text-slate-400 mb-2">Comma-separate up to 5 competitor names. Pages save as drafts under Landing Pages.</p>
            <div className="flex gap-2">
              <input value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="Huntr, Teal, Notion, Simplify" className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
              <button onClick={runComparisons} disabled={running || !competitors} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Generate Pages'}
              </button>
            </div>
          </SectionPanel>

          {comparisonResult && (
            <div className="space-y-4">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {comparisonResult.pages.map((p: any, i: number) => (
                <SectionPanel key={i} className="border-emerald-500/30" title={`vs ${p.competitor}`}>
                  <h3 className="text-base font-bold text-slate-100 mb-1">{p.page.hero.headline}</h3>
                  <p className="text-sm text-slate-300 mb-3">{p.page.hero.subheadline}</p>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                          <th className="px-2 py-1.5 text-left">Feature</th>
                          <th className="px-2 py-1.5 text-left">Us</th>
                          <th className="px-2 py-1.5 text-left">Them</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {p.page.comparison_table.map((row: any, j: number) => (
                          <tr key={j} className={row.advantage === 'us' ? 'bg-emerald-500/5' : row.advantage === 'them' ? 'bg-rose-500/5' : ''}>
                            <td className="px-2 py-1.5 font-semibold text-slate-200">{row.feature}</td>
                            <td className="px-2 py-1.5 text-slate-300">{row.us}</td>
                            <td className="px-2 py-1.5 text-slate-400">{row.them}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionPanel>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
