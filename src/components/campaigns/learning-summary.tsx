'use client'

// Per-campaign Learning Summary card.
//
// Renders the deterministic summary built by `lib/campaigns/learning.ts`
// (via the GET /api/campaigns/[id]/learnings route). Surfaces best/worst
// channel, the strongest hook, the highest-signal asset, and a short list
// of recommended next experiments + reusable style notes.
//
// Deliberately read-only: the recommendation engine is pure, and the API
// already persists the summary back onto the campaign so other surfaces
// (next launch, Marketing Memory) can read it without recomputing.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Trophy, TrendingUp, TrendingDown, ListChecks, Sparkles, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { formatMoney, formatPct } from '@/lib/metrics/derive'

interface LearningChannel {
  channel: string
  reason: string
  metrics: {
    impressions: number
    clicks: number
    conversions: number
    spend: number
    revenue: number
    ctr: number | null
    conversion_rate: number | null
    cpc: number | null
    cpl: number | null
    roas: number | null
  }
}

interface LearningAsset {
  kind: 'ad' | 'social' | 'email'
  id: string
  label: string
  detail: string
  score: number | null
}

interface LearningSummary {
  generatedAt: string
  bestChannel: LearningChannel | null
  worstChannel: LearningChannel | null
  bestAsset: LearningAsset | null
  strongestHook: string | null
  recommendedNext: string[]
  reusableStyleNotes: string[]
  inputCounts: { metrics: number; ads: number; social: number; email: number }
}

interface ResponseShape {
  summary: LearningSummary
}

interface Props {
  campaignId: string
}

export function LearningSummaryPanel({ campaignId }: Props) {
  const [state, setState] = useState<{ id: string; summary: LearningSummary | null; error: string | null } | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    void fetchSummary(ctrl.signal)
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  async function fetchSummary(signal?: AbortSignal) {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/learnings`, { signal })
      if (!res.ok) {
        setState({ id: campaignId, summary: null, error: `Failed (${res.status})` })
        return
      }
      const body = (await res.json()) as ResponseShape
      setState({ id: campaignId, summary: body.summary, error: null })
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setState({ id: campaignId, summary: null, error: 'Failed to load summary' })
    }
  }

  async function refresh() {
    setRefreshing(true)
    await fetchSummary()
    setRefreshing(false)
    toast.success('Learning summary refreshed')
  }

  // Derived loading: covers both "first load" and "campaignId changed".
  const loading = state === null || state.id !== campaignId
  const summary = !loading ? state?.summary ?? null : null
  const error = !loading ? state?.error ?? null : null

  return (
    <SectionPanel
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
          Learning Summary
        </span>
      }
      action={
        <button
          onClick={refresh}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {loading ? (
        <div className="h-24 animate-pulse rounded-md bg-slate-800/60" />
      ) : error ? (
        <p className="text-xs text-rose-300">{error}</p>
      ) : !summary ? (
        <p className="text-xs text-slate-500">No summary available yet.</p>
      ) : (
        <div className="space-y-4">
          {/* Counts row tells the operator what data we summarized over. */}
          <div className="flex flex-wrap gap-2 text-[10px] font-mono-data text-slate-500">
            <span>{summary.inputCounts.metrics} metric row{summary.inputCounts.metrics === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{summary.inputCounts.ads} ad{summary.inputCounts.ads === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{summary.inputCounts.social} social post{summary.inputCounts.social === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{summary.inputCounts.email} email template{summary.inputCounts.email === 1 ? '' : 's'}</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ChannelCard kind="best" channel={summary.bestChannel} />
            <ChannelCard kind="worst" channel={summary.worstChannel} />
          </div>

          {summary.strongestHook && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                <Trophy className="h-3.5 w-3.5" />
                Strongest hook
              </div>
              <p className="mt-1 text-sm text-slate-100">{summary.strongestHook}</p>
            </div>
          )}

          {summary.bestAsset && (
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Trophy className="h-3.5 w-3.5 text-emerald-300" />
                  Best asset · {summary.bestAsset.kind}
                </div>
                {summary.bestAsset.score != null && (
                  <span className="font-mono-data text-[10px] text-slate-500">score {summary.bestAsset.score.toFixed(1)}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-100">{summary.bestAsset.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{summary.bestAsset.detail}</p>
            </div>
          )}

          {summary.recommendedNext.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <ListChecks className="h-3.5 w-3.5" />
                Recommended next experiments
              </div>
              <ul className="space-y-1.5">
                {summary.recommendedNext.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-200">
                    <span className="font-mono-data text-[10px] text-slate-500 pt-1">{i + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.reusableStyleNotes.length > 0 && (
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reusable style notes</div>
              <ul className="space-y-1 text-xs text-slate-400">
                {summary.reusableStyleNotes.map((note, i) => (
                  <li key={i}>· {note}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] font-mono-data text-slate-500">
            <span>Generated {new Date(summary.generatedAt).toLocaleString()}</span>
            <Link href={`/launch?campaignId=${campaignId}`} className="text-emerald-300 hover:text-emerald-200">
              Re-launch with these learnings →
            </Link>
          </div>
        </div>
      )}
    </SectionPanel>
  )
}

function ChannelCard({ kind, channel }: { kind: 'best' | 'worst'; channel: LearningChannel | null }) {
  if (!channel) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{kind === 'best' ? 'Best channel' : 'Worst channel'}</div>
        <p className="mt-1 text-xs text-slate-500">No data yet — log metrics in the panel below.</p>
      </div>
    )
  }
  const Icon = kind === 'best' ? TrendingUp : TrendingDown
  const tone = kind === 'best' ? 'success' : 'warn'
  return (
    <div className={`rounded-md border p-3 ${kind === 'best' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider ${kind === 'best' ? 'text-emerald-300' : 'text-amber-300'}`}>
          <Icon className="h-3.5 w-3.5" />
          {kind === 'best' ? 'Best channel' : 'Worst channel'}
        </div>
        <StatusPill tone={tone}>{channel.channel}</StatusPill>
      </div>
      <p className="mt-1 text-sm text-slate-100">{channel.reason}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono-data text-slate-500">
        <div>Spend {formatMoney(channel.metrics.spend, 0)}</div>
        <div>ROAS {channel.metrics.roas != null ? `${channel.metrics.roas.toFixed(2)}x` : '—'}</div>
        <div>CTR {formatPct(channel.metrics.ctr, 1)}</div>
        <div>CPL {formatMoney(channel.metrics.cpl, 2)}</div>
        <div>CPC {formatMoney(channel.metrics.cpc, 2)}</div>
        <div>Conv {channel.metrics.conversions}</div>
      </div>
    </div>
  )
}
