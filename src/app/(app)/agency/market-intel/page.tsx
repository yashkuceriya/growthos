'use client'

import { useEffect, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Radar, Loader2, Plus, Trash2, TrendingUp, Flame, Lightbulb, AlertTriangle } from 'lucide-react'

interface Intel {
  scanned_at: string
  trending_themes: Array<{ theme: string; why_hot: string; evidence: string[]; relevance_to_product_0_10: number; angle_we_could_own: string }>
  pain_points_surfacing: Array<{ pain: string; frequency_signal: string; emotional_tone: string; example_quote: string; can_we_solve: string }>
  feature_requests_heard: string[]
  competitor_moves: Array<{ competitor: string; move: string; our_response_angle: string }>
  white_space_gaps: string[]
  newsjacking_opportunities: Array<{ headline: string; response_angle: string; urgency_hours: number }>
  recommended_content_hooks: Array<{ hook: string; format: string; why_now: string }>
  avoid_topics: string[]
  sentiment_summary: string
}

export default function MarketIntelPage() {
  const { activeProject } = useProject()
  const supabase = createClient()
  const [intel, setIntel] = useState<Intel | null>(null)
  const [running, setRunning] = useState(false)
  const [extraSubs, setExtraSubs] = useState<string[]>([''])
  const [rssFeeds, setRssFeeds] = useState<string[]>([''])
  const [sources, setSources] = useState<{ subreddits_scanned: string[]; reddit_threads_count: number; hn_stories_count: number; rss_items_count: number } | null>(null)

  async function refresh() {
    if (!activeProject) return
    const { data } = await supabase.from('projects').select('brand_voice').eq('id', activeProject.id).single()
    const bv = (data?.brand_voice as Record<string, unknown>) ?? {}
    setIntel((bv.market_intel as Intel | undefined) ?? null)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProject?.id])

  async function runScan() {
    if (!activeProject) return
    setRunning(true)
    try {
      const res = await fetch('/api/agency/market-intel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          extraSubreddits: extraSubs.map((s) => s.trim().replace(/^r\//, '')).filter(Boolean),
          rssFeeds: rssFeeds.map((s) => s.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setIntel(json.intel)
      setSources(json.sources)
      toast.success(`Scanned ${json.sources.reddit_threads_count} threads + ${json.sources.hn_stories_count} HN stories`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setRunning(false)
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Market Intelligence"
        subtitle="Live pulse from where your audience actually is. Reddit threads, HN stories, competitor moves — synthesized into themes, pains, gaps, and hooks."
      />

      <SectionPanel className="mb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-sm text-slate-300">Scan the market around <span className="font-semibold text-emerald-300">{activeProject.name}</span>.</p>
            {intel?.scanned_at && <p className="text-[10px] font-mono-data text-slate-500 mt-1">Last scan: {new Date(intel.scanned_at).toLocaleString()}</p>}
          </div>
          <button onClick={runScan} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
            {running ? 'Scanning…' : intel ? 'Re-scan' : 'Scan Market'}
          </button>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Advanced sources (optional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Extra subreddits</div>
              {extraSubs.map((s, i) => (
                <div key={i} className="flex gap-1 mb-1">
                  <input value={s} onChange={(e) => { const next = [...extraSubs]; next[i] = e.target.value; setExtraSubs(next) }} placeholder="e.g. SideProject" className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none" />
                  {extraSubs.length > 1 && <button onClick={() => setExtraSubs(extraSubs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-400"><Trash2 className="h-3 w-3" /></button>}
                </div>
              ))}
              {extraSubs.length < 5 && <button onClick={() => setExtraSubs([...extraSubs, ''])} className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"><Plus className="h-3 w-3" />Add subreddit</button>}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">RSS feeds (competitor blogs, industry)</div>
              {rssFeeds.map((s, i) => (
                <div key={i} className="flex gap-1 mb-1">
                  <input value={s} onChange={(e) => { const next = [...rssFeeds]; next[i] = e.target.value; setRssFeeds(next) }} placeholder="https://example.com/feed" className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none" />
                  {rssFeeds.length > 1 && <button onClick={() => setRssFeeds(rssFeeds.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-400"><Trash2 className="h-3 w-3" /></button>}
                </div>
              ))}
              {rssFeeds.length < 3 && <button onClick={() => setRssFeeds([...rssFeeds, ''])} className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"><Plus className="h-3 w-3" />Add RSS</button>}
            </div>
          </div>
        </details>

        {sources && (
          <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
            <StatusPill tone="success">{sources.reddit_threads_count} Reddit threads</StatusPill>
            <StatusPill tone="info">{sources.hn_stories_count} HN stories</StatusPill>
            {sources.rss_items_count > 0 && <StatusPill tone="neutral">{sources.rss_items_count} RSS items</StatusPill>}
            <StatusPill tone="neutral">Subs: {sources.subreddits_scanned.map((s) => 'r/' + s).join(', ')}</StatusPill>
          </div>
        )}
      </SectionPanel>

      {intel && (
        <>
          <SectionPanel className="mb-4 border-emerald-500/30" title={<span className="flex items-center gap-2"><Flame className="h-4 w-4 text-emerald-400" />Sentiment Pulse</span>}>
            <p className="text-sm text-slate-100">{intel.sentiment_summary}</p>
          </SectionPanel>

          <SectionPanel className="mb-4" title={<span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" />Trending Themes</span>}>
            <div className="space-y-2">
              {intel.trending_themes?.map((t, i) => (
                <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-100">{t.theme}</span>
                    <StatusPill tone={t.relevance_to_product_0_10 >= 7 ? 'success' : t.relevance_to_product_0_10 >= 4 ? 'warn' : 'neutral'}>relevance {t.relevance_to_product_0_10}/10</StatusPill>
                  </div>
                  <p className="text-xs text-slate-300 mb-2">{t.why_hot}</p>
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 mb-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Our angle</div>
                    <p className="text-xs text-slate-100 mt-0.5">{t.angle_we_could_own}</p>
                  </div>
                  {t.evidence?.length > 0 && (
                    <ul className="text-[11px] text-slate-500 italic space-y-0.5">
                      {t.evidence.slice(0, 3).map((e, j) => <li key={j}>• {e}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel className="mb-4" title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" />Pain Points Surfacing</span>}>
            <div className="space-y-2">
              {intel.pain_points_surfacing?.map((p, i) => (
                <div key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-100">{p.pain}</span>
                    <StatusPill tone={p.frequency_signal === 'dominant' ? 'error' : p.frequency_signal === 'common' ? 'warn' : 'neutral'}>{p.frequency_signal}</StatusPill>
                    <StatusPill tone="neutral">{p.emotional_tone}</StatusPill>
                    <StatusPill tone={p.can_we_solve === 'directly' ? 'success' : p.can_we_solve === 'partially' ? 'warn' : 'neutral'}>{p.can_we_solve}</StatusPill>
                  </div>
                  <p className="text-xs text-slate-400 italic mt-1">&ldquo;{p.example_quote}&rdquo;</p>
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel className="mb-4" title={<span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-emerald-400" />Recommended Content Hooks (this week)</span>}>
            <ul className="space-y-2">
              {intel.recommended_content_hooks?.map((h, i) => (
                <li key={i} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusPill tone="accent">{h.format.replace(/_/g, ' ')}</StatusPill>
                  </div>
                  <p className="text-sm text-slate-100 font-medium">{h.hook}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Why now: {h.why_now}</p>
                </li>
              ))}
            </ul>
          </SectionPanel>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <SectionPanel title="White Space Gaps">
              <ul className="text-xs text-slate-200 space-y-0.5">
                {intel.white_space_gaps?.map((g, i) => <li key={i}>· {g}</li>)}
              </ul>
            </SectionPanel>
            <SectionPanel title="Feature Requests Heard">
              <ul className="text-xs text-slate-200 space-y-0.5">
                {intel.feature_requests_heard?.map((r, i) => <li key={i}>· {r}</li>)}
              </ul>
            </SectionPanel>
          </div>

          {intel.competitor_moves?.length > 0 && (
            <SectionPanel className="mb-4" title="Competitor Moves">
              <ul className="space-y-2">
                {intel.competitor_moves.map((c, i) => (
                  <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusPill tone="warn">{c.competitor}</StatusPill>
                    </div>
                    <p className="text-xs text-slate-300 mb-1">{c.move}</p>
                    <p className="text-xs text-emerald-300">Our response: {c.our_response_angle}</p>
                  </li>
                ))}
              </ul>
            </SectionPanel>
          )}

          <SectionPanel className="mb-4 border-amber-500/30" title="Newsjacking Opportunities">
            <ul className="space-y-2">
              {intel.newsjacking_opportunities?.map((n, i) => (
                <li key={i} className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-amber-200">{n.headline}</span>
                    <StatusPill tone={n.urgency_hours <= 24 ? 'error' : n.urgency_hours <= 72 ? 'warn' : 'neutral'}>respond in {n.urgency_hours}h</StatusPill>
                  </div>
                  <p className="text-xs text-slate-200">{n.response_angle}</p>
                </li>
              ))}
            </ul>
          </SectionPanel>

          {intel.avoid_topics?.length > 0 && (
            <SectionPanel className="border-rose-500/20" title="Avoid This Week">
              <ul className="text-xs text-rose-200 space-y-0.5">
                {intel.avoid_topics.map((t, i) => <li key={i}>⚠ {t}</li>)}
              </ul>
            </SectionPanel>
          )}
        </>
      )}
    </PageShell>
  )
}
