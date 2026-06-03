'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useProject } from '@/hooks/use-project'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill, type StatusTone } from '@/components/ui/status-pill'
import { QualityVerdict } from '@/components/marketing/quality-verdict'
import type { GeneratedQualityScore } from '@/lib/marketing/quality'
import { cn } from '@/lib/utils'

type Band = 'all' | 'weak' | 'review' | 'strong'

interface QualityAsset {
  id: string
  channel: string
  surface: string
  title: string
  body: string
  href: string
  status: string | null
  createdAt: string | null
  quality: GeneratedQualityScore
  band: Exclude<Band, 'all'>
}

interface QualityResponse {
  items: QualityAsset[]
  summary: {
    total: number
    weak: number
    review: number
    strong: number
    average: number | null
  }
}

export default function QualityPage() {
  const { activeProject } = useProject()
  const [data, setData] = useState<QualityResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [band, setBand] = useState<Band>('weak')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [improvingId, setImprovingId] = useState<string | null>(null)

  async function load() {
    if (!activeProject?.id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/quality/assets?projectId=${encodeURIComponent(activeProject.id)}&limit=100`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Quality review failed')
      setData(body as QualityResponse)
      setSelectedId((current) => current ?? (body.items?.[0]?.id ?? null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quality review failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.items ?? []).filter((item) => {
      if (band !== 'all' && item.band !== band) return false
      if (!q) return true
      return `${item.title} ${item.body} ${item.channel} ${item.surface}`.toLowerCase().includes(q)
    })
  }, [band, data?.items, query])

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null

  async function improveSelected() {
    if (!activeProject?.id || !selected) return
    setImprovingId(selected.id)
    try {
      const res = await fetch('/api/quality/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          id: selected.id,
          channel: selected.channel,
          surface: selected.surface,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Improve failed')
      const before = body.before?.overall
      const after = body.after?.overall
      toast.success(before && after ? `Improved ${before}/10 → ${after}/10` : 'Asset improved')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Improve failed')
    } finally {
      setImprovingId(null)
    }
  }

  if (!activeProject) {
    return <PageShell><p className="text-slate-400">Select a project</p></PageShell>
  }

  return (
    <PageShell>
      <PageHeader
        title="Quality Review"
        subtitle="Rank, inspect, and fix marketing assets before they go live."
        actions={
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="mb-4 grid grid-cols-4 gap-3">
        <SummaryTile label="Average" value={data?.summary.average != null ? `${data.summary.average}/10` : '-'} tone="info" />
        <SummaryTile label="Weak" value={String(data?.summary.weak ?? 0)} tone="error" />
        <SummaryTile label="Review" value={String(data?.summary.review ?? 0)} tone="warn" />
        <SummaryTile label="Strong" value={String(data?.summary.strong ?? 0)} tone="success" />
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5 w-fit">
          {(['weak', 'review', 'strong', 'all'] as Band[]).map((key) => (
            <button
              key={key}
              onClick={() => setBand(key)}
              className={cn(
                'rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider',
                band === key ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {key}
            </button>
          ))}
        </div>
        <label className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionPanel title={`${filtered.length} asset${filtered.length === 1 ? '' : 's'}`} contentClassName="p-0">
          {loading && !data ? (
            <div className="flex items-center gap-2 p-4 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> Scoring assets…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No assets match this review view.</div>
          ) : (
            <ul className="max-h-[680px] overflow-y-auto divide-y divide-slate-800">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/50',
                      selected?.id === item.id && 'bg-emerald-500/5',
                    )}
                  >
                    <BandIcon band={item.band} />
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-100">{item.title}</span>
                        <StatusPill tone={toneForBand(item.band)}>{item.quality.overall}/10</StatusPill>
                      </span>
                      <span className="line-clamp-2 text-xs text-slate-400">{stripHtml(item.body)}</span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        <StatusPill tone="neutral">{item.channel}</StatusPill>
                        <StatusPill tone="info">{item.surface}</StatusPill>
                        {item.status && <StatusPill tone="neutral">{item.status}</StatusPill>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>

        <SectionPanel
          title={selected ? 'Asset Verdict' : 'No Asset Selected'}
          action={selected ? (
            <>
              <button
                onClick={() => void improveSelected()}
                disabled={improvingId === selected.id}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
              >
                {improvingId === selected.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Improve
              </button>
              <Link href={selected.href} className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
                <ExternalLink className="h-3 w-3" /> Open
              </Link>
            </>
          ) : null}
        >
          {selected ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusPill tone={toneForBand(selected.band)}>{selected.band}</StatusPill>
                  <StatusPill tone="neutral">{selected.channel}</StatusPill>
                  <StatusPill tone="info">{selected.surface}</StatusPill>
                </div>
                <h2 className="text-lg font-semibold text-slate-100">{selected.title}</h2>
              </div>
              <QualityVerdict quality={selected.quality} />
              <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
                <pre className="max-h-[360px] whitespace-pre-wrap font-mono-data text-xs leading-6 text-slate-300">{stripHtml(selected.body)}</pre>
              </div>
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-slate-300">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" /> Next Improvement
                </div>
                {selected.quality.recommendations[0] ?? 'This asset is strong. Use it as a style reference or promote it after results come in.'}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Pick an asset to inspect.</p>
          )}
        </SectionPanel>
      </div>
    </PageShell>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono-data text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <StatusPill tone={tone}>{tone}</StatusPill>
      </div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  )
}

function BandIcon({ band }: { band: Exclude<Band, 'all'> }) {
  if (band === 'strong') return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
  if (band === 'review') return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
  return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
}

function toneForBand(band: Exclude<Band, 'all'>): StatusTone {
  if (band === 'strong') return 'success'
  if (band === 'review') return 'warn'
  return 'error'
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
