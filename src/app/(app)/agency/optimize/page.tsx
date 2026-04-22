'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { FileSearch, Link as LinkIcon, Recycle, Bot, Target, FlaskConical, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = 'onpage_audit' | 'internal_links' | 'repurposing' | 'aeo' | 'lp_audit' | 'ab_hypotheses'

const TOOLS: Array<{ key: Tool; label: string; icon: typeof FileSearch; desc: string; inputHint: string }> = [
  { key: 'onpage_audit', label: 'On-Page Audit', icon: FileSearch, desc: 'Title, meta, H1, alt text, schema, readability', inputHint: 'URL to audit (defaults to project site)' },
  { key: 'internal_links', label: 'Internal Links', icon: LinkIcon, desc: 'Suggest 5-7 internal links between your content', inputHint: 'Source page topic + list of existing posts' },
  { key: 'repurposing', label: 'Content Repurposing', icon: Recycle, desc: '1 piece → 8-15 derivative assets across channels', inputHint: 'Paste source blog post / transcript / thread' },
  { key: 'aeo', label: 'AEO Optimizer', icon: Bot, desc: 'Optimize for ChatGPT / Perplexity / Gemini citations', inputHint: 'Target query + URL' },
  { key: 'lp_audit', label: 'Landing Page Audit', icon: Target, desc: 'Conversion audit with lift estimates per fix', inputHint: 'URL of landing page' },
  { key: 'ab_hypotheses', label: 'A/B Hypotheses', icon: FlaskConical, desc: '8-15 test ideas ranked by ICE score', inputHint: 'Current metrics / problem to solve' },
]

export default function OptimizePage() {
  const { activeProject } = useProject()
  const [tool, setTool] = useState<Tool>('onpage_audit')
  const [running, setRunning] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null)

  const [url, setUrl] = useState('')
  const [source, setSource] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const [currentMetrics, setCurrentMetrics] = useState('')
  const [postsJson, setPostsJson] = useState('')

  async function run() {
    if (!activeProject) return
    setRunning(true)
    setResult(null)
    try {
      const input: Record<string, unknown> = {}
      if (tool === 'onpage_audit' || tool === 'lp_audit' || tool === 'aeo') input.url = url || undefined
      if (tool === 'aeo') input.target_query = targetQuery
      if (tool === 'repurposing') input.source = source
      if (tool === 'ab_hypotheses') input.current_metrics = currentMetrics
      if (tool === 'internal_links') {
        input.source = source
        try { input.posts = JSON.parse(postsJson || '[]') } catch { input.posts = [] }
      }
      const res = await fetch('/api/agency/optimize', {
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

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  const currentTool = TOOLS.find((t) => t.key === tool)!

  return (
    <PageShell>
      <PageHeader title="Optimization Suite" subtitle="Audit, repurpose, and A/B test every asset — vertical-aware" />

      <div className="grid grid-cols-3 gap-3 mb-4">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => { setTool(t.key); setResult(null) }}
              className={cn(
                'text-left rounded-md border p-4 transition-all',
                tool === t.key ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-md bg-slate-800', tool === t.key ? 'text-emerald-400' : 'text-slate-400')}>
                  <Icon className="h-4 w-4" />
                </div>
                {tool === t.key && <StatusPill tone="accent">Active</StatusPill>}
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{t.label}</h3>
              <p className="mt-1 text-xs text-slate-400">{t.desc}</p>
            </button>
          )
        })}
      </div>

      <SectionPanel className="mb-4" title={currentTool.label}>
        <p className="text-xs text-slate-500 mb-3">{currentTool.inputHint}</p>
        <div className="space-y-2">
          {(tool === 'onpage_audit' || tool === 'lp_audit' || tool === 'aeo') && (
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
          )}
          {tool === 'aeo' && (
            <input value={targetQuery} onChange={(e) => setTargetQuery(e.target.value)} placeholder="Target query (e.g. 'best job application tracker')" className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
          )}
          {tool === 'repurposing' && (
            <textarea value={source} onChange={(e) => setSource(e.target.value)} rows={6} placeholder="Paste source content (blog post / transcript / thread)..." className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
          )}
          {tool === 'internal_links' && (
            <>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source page title/topic" className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
              <textarea value={postsJson} onChange={(e) => setPostsJson(e.target.value)} rows={5} placeholder='[{"title":"Post 1","url":"/p/post-1","excerpt":"..."}]' className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono-data text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
            </>
          )}
          {tool === 'ab_hypotheses' && (
            <textarea value={currentMetrics} onChange={(e) => setCurrentMetrics(e.target.value)} rows={4} placeholder="Current metrics or problem (e.g. 'signup conversion 2.1%, want 4%. Pricing page gets 8% CTR but trial-to-paid is only 12%')" className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
          )}
          <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Run Tool'}
          </button>
        </div>
      </SectionPanel>

      {result && <ResultPanel tool={tool} result={result} />}
    </PageShell>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResultPanel({ tool, result }: { tool: Tool; result: any }) {
  if (tool === 'onpage_audit') {
    return (
      <SectionPanel className="border-emerald-500/30" title={<span>On-Page Audit · Score {result.overall_score_0_100}/100</span>}>
        {result.quick_wins?.length > 0 && (
          <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Quick Wins</div>
            <ol className="list-decimal list-inside text-xs text-slate-200 space-y-0.5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {result.quick_wins.map((q: string, i: number) => <li key={i}>{q}</li>)}
            </ol>
          </div>
        )}
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="px-2 py-1.5 text-left">Area</th>
              <th className="px-2 py-1.5 text-left">Status</th>
              <th className="px-2 py-1.5 text-left">Finding</th>
              <th className="px-2 py-1.5 text-left">Fix</th>
              <th className="px-2 py-1.5 text-center">Impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.checks.map((c: any, i: number) => (
              <tr key={i}>
                <td className="px-2 py-2 text-slate-300">{c.category}</td>
                <td className="px-2 py-2"><StatusPill tone={c.status === 'pass' ? 'success' : c.status === 'warn' ? 'warn' : 'error'}>{c.status}</StatusPill></td>
                <td className="px-2 py-2 text-slate-400">{c.finding}</td>
                <td className="px-2 py-2 text-slate-200">{c.fix}</td>
                <td className="px-2 py-2 text-center"><StatusPill tone={c.impact === 'high' ? 'error' : c.impact === 'medium' ? 'warn' : 'neutral'}>{c.impact}</StatusPill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionPanel>
    )
  }
  if (tool === 'internal_links') {
    return (
      <SectionPanel title="Internal Link Suggestions">
        <ul className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.suggested_links?.map((l: any, i: number) => (
            <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="flex items-center gap-2 mb-1">
                <StatusPill tone="accent">{l.anchor_text}</StatusPill>
                <span className="text-xs text-slate-400">→ {l.target_page_or_topic}</span>
              </div>
              <p className="text-xs text-slate-300 mb-1">{l.rationale}</p>
              <p className="text-[11px] font-mono-data text-slate-500">Placement: {l.placement_suggestion}</p>
            </li>
          ))}
        </ul>
      </SectionPanel>
    )
  }
  if (tool === 'repurposing') {
    return (
      <SectionPanel title="Content Repurposing Map">
        <div className="grid grid-cols-2 gap-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.derivatives?.map((d: any, i: number) => (
            <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <StatusPill tone="accent">{d.channel}</StatusPill>
                <StatusPill tone="neutral">{d.format}</StatusPill>
                <StatusPill tone={d.estimated_reach_impact === 'high' ? 'success' : d.estimated_reach_impact === 'medium' ? 'warn' : 'neutral'}>{d.estimated_reach_impact}</StatusPill>
              </div>
              <p className="text-xs font-semibold text-slate-100 mb-1">{d.hook}</p>
              <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-sans">{d.full_content}</pre>
            </div>
          ))}
        </div>
      </SectionPanel>
    )
  }
  if (tool === 'aeo') {
    return (
      <div className="space-y-4">
        <SectionPanel className="border-emerald-500/30" title={`AEO Fitness · ${result.current_fit_score}/100`}>
          <div className="mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Featured Snippet Draft</div>
            <p className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100 italic">{result.featured_snippet_draft}</p>
          </div>
          <ul className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.optimizations?.map((o: any, i: number) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="mb-1"><StatusPill tone="warn">{o.area}</StatusPill></div>
                <p className="text-xs text-slate-300 mb-1">Issue: {o.issue}</p>
                <p className="text-xs text-emerald-300">Fix: {o.fix}</p>
              </li>
            ))}
          </ul>
        </SectionPanel>
        <SectionPanel title="llms.txt" contentClassName="p-0">
          <pre className="overflow-x-auto bg-slate-950 p-4 font-mono-data text-[11px] text-emerald-300 whitespace-pre-wrap">{result.llms_txt_content}</pre>
        </SectionPanel>
      </div>
    )
  }
  if (tool === 'lp_audit') {
    return (
      <SectionPanel className="border-emerald-500/30" title={<span>Landing Page Audit · Conversion: <StatusPill tone={result.overall_conversion_prediction === 'excellent' || result.overall_conversion_prediction === 'above_avg' ? 'success' : result.overall_conversion_prediction === 'avg' ? 'warn' : 'error'}>{result.overall_conversion_prediction}</StatusPill></span>}>
        <div className="grid grid-cols-5 gap-2 mb-4">
          {[
            ['Headline', result.headline_clarity_0_10],
            ['Value', result.value_prop_specificity_0_10],
            ['CTA', result.cta_prominence_0_10],
            ['Proof', result.social_proof_0_10],
            ['Friction↓', 10 - result.friction_score_0_10],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-md border border-slate-800 bg-slate-800/40 p-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
              <div className="mt-1 font-mono-data text-xl font-semibold text-emerald-300">{v as number}/10</div>
            </div>
          ))}
        </div>
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Top 3 Fixes</div>
          <ol className="list-decimal list-inside text-sm text-slate-200 space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.top_3_fixes?.map((f: string, i: number) => <li key={i}>{f}</li>)}
          </ol>
        </div>
        <ul className="space-y-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result.findings?.map((f: any, i: number) => (
            <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-100">{f.element}</span>
                <StatusPill tone="accent">+{f.lift_estimate_pct}% lift</StatusPill>
              </div>
              <p className="text-xs text-slate-400 mb-1">Issue: {f.issue}</p>
              <p className="text-xs text-emerald-300">Fix: {f.fix}</p>
            </li>
          ))}
        </ul>
      </SectionPanel>
    )
  }
  if (tool === 'ab_hypotheses') {
    return (
      <SectionPanel title="A/B Test Hypotheses · Ranked by ICE" contentClassName="p-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Hypothesis</th>
              <th className="px-3 py-2 text-center">I</th>
              <th className="px-3 py-2 text-center">C</th>
              <th className="px-3 py-2 text-center">E</th>
              <th className="px-3 py-2 text-center">ICE</th>
              <th className="px-3 py-2 text-center">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.hypotheses?.map((h: any, i: number) => (
              <tr key={i} className="hover:bg-slate-800/40">
                <td className="px-3 py-2 font-mono-data text-slate-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="font-semibold text-slate-100 mb-1">{h.name}</div>
                  <div className="text-[11px] text-slate-400 mb-1">{h.hypothesis}</div>
                  <div className="text-[10px] font-mono-data text-slate-500">A: {h.variant_a} · B: {h.variant_b}</div>
                </td>
                <td className="px-3 py-2 text-center font-mono-data text-emerald-300">{h.ice_impact}</td>
                <td className="px-3 py-2 text-center font-mono-data text-emerald-300">{h.ice_confidence}</td>
                <td className="px-3 py-2 text-center font-mono-data text-slate-300">{h.ice_effort}</td>
                <td className="px-3 py-2 text-center"><StatusPill tone={h.ice_score >= 15 ? 'success' : h.ice_score >= 8 ? 'warn' : 'neutral'}>{h.ice_score}</StatusPill></td>
                <td className="px-3 py-2 text-center font-mono-data text-slate-400">{h.duration_days}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionPanel>
    )
  }
  return null
}
