'use client'

// Dashboard panel surfacing the single "Next Best Action" for the active
// project. Read-only client fetch against /api/next-action — keeps the
// rendering deterministic and the helper decision pure.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles, AlertTriangle, Zap } from 'lucide-react'
import { SectionPanel } from '@/components/ui/section-panel'
import type { NextBestAction } from '@/lib/marketing/next-action'

interface NextBestActionPanelProps {
  projectId: string | null
  /** When set, metrics are scoped to this campaign (must belong to project). */
  campaignId?: string | null
  title?: string
}

const PRIORITY_STYLES = {
  high: {
    pill: 'bg-emerald-500 text-slate-950',
    label: 'Do this next',
    icon: Zap,
  },
  medium: {
    pill: 'bg-amber-400/90 text-slate-950',
    label: 'Next step',
    icon: Sparkles,
  },
  low: {
    pill: 'bg-slate-700 text-slate-200',
    label: 'When ready',
    icon: Sparkles,
  },
} as const

interface FetchedState {
  forProjectId: string | null
  forCampaignId: string | null
  action: NextBestAction | null
  error: string | null
}

export function NextBestActionPanel({ projectId, campaignId = null, title = 'Next best action' }: NextBestActionPanelProps) {
  const campKey = campaignId ?? null
  const [state, setState] = useState<FetchedState | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const params = new URLSearchParams()
    if (projectId) params.set('projectId', projectId)
    if (campKey) params.set('campaignId', campKey)
    const qs = params.toString()
    const url = qs ? `/api/next-action?${qs}` : '/api/next-action'
    fetch(url, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j?.action) {
          setState({ forProjectId: projectId, forCampaignId: campKey, action: j.action as NextBestAction, error: null })
        } else {
          setState({ forProjectId: projectId, forCampaignId: campKey, action: null, error: 'No recommendation available' })
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setState({ forProjectId: projectId, forCampaignId: campKey, action: null, error: 'Failed to load recommendation' })
      })
    return () => ctrl.abort()
  }, [projectId, campKey])

  // Treat the panel as loading while we don't yet have a response for the
  // currently-active projectId. Computing this derived value (instead of a
  // setLoading-in-effect call) keeps us on the right side of the React 19
  // set-state-in-effect rule.
  const loading = state === null
    || state.forProjectId !== projectId
    || state.forCampaignId !== campKey
  const action = !loading ? state?.action ?? null : null
  const error = !loading ? state?.error ?? null : null

  if (loading) {
    return (
      <SectionPanel title={title}>
        <div className="h-16 animate-pulse rounded-md bg-slate-800/60" />
      </SectionPanel>
    )
  }

  if (error || !action) {
    return (
      <SectionPanel title={title}>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error ?? 'No recommendation available right now.'}
        </div>
      </SectionPanel>
    )
  }

  const style = PRIORITY_STYLES[action.priority]
  const Icon = style.icon

  return (
    <SectionPanel
      title={title}
      action={<span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.pill}`}>{style.label}</span>}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">{action.title}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{action.reason}</p>
          </div>
        </div>
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 md:self-auto"
        >
          {action.ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </SectionPanel>
  )
}
