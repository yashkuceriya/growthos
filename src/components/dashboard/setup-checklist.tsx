'use client'

// Progressive activation guide. The dashboard renders this when the
// active project hasn't yet completed the full pipeline. Each step
// has a clear next action and checks the project state to know
// whether to mark it done.
//
// Steps in order:
//   1. Project created (always done if we got here)
//   2. Website URL set on the project
//   3. Site sync run at least once (brand_voice populated)
//   4. First ad generated
//   5. First campaign launched (full Launch Orchestrator)
//
// Once all steps are done the component renders nothing — the user
// is past activation, the dashboard's KPI grid is the right surface.

import Link from 'next/link'
import { CheckCircle2, Circle, ArrowRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SetupStep {
  key: string
  title: string
  description: string
  href: string
  cta: string
  done: boolean
}

export interface SetupState {
  hasWebsite: boolean
  hasSiteSync: boolean
  hasFirstAd: boolean
  hasFirstCampaign: boolean
}

export function buildSteps(activeProject: { name?: string; website?: string | null; brand_voice?: unknown } | null, state: SetupState): SetupStep[] {
  if (!activeProject) return []
  return [
    {
      key: 'website',
      title: 'Add a product URL',
      description: 'Tell GrowthOS where to find your product. We use this for the brand sync, ad image references, and content grounding.',
      href: '/projects',
      cta: 'Open project settings',
      done: state.hasWebsite,
    },
    {
      key: 'sync',
      title: 'Run the first site sync',
      description: 'Crawls your URL, extracts brand info, captures a fresh UI screenshot, and saves a brand voice profile that all generators read from.',
      href: '/projects',
      cta: 'Click Sync Site',
      done: state.hasSiteSync,
    },
    {
      key: 'ad',
      title: 'Generate your first ad',
      description: 'Take the brand voice for a spin. The Ad Studio iterates copy through a 5-dimension evaluator until it hits 7.0+ — you should see real product-specific text in under 60 seconds.',
      href: '/ad-studio/generate',
      cta: 'Open Ad Studio',
      done: state.hasFirstAd,
    },
    {
      key: 'campaign',
      title: 'Run a full Launch',
      description: 'The Launch Orchestrator runs CMO → SEO → Director → Analytics, then 8 channel generators in parallel — Meta, LinkedIn, TikTok, X, Reddit, email, blog, landing page. One click, one minute.',
      href: '/launch',
      cta: 'Open Launch',
      done: state.hasFirstCampaign,
    },
  ]
}

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  if (steps.length === 0) return null
  const allDone = steps.every((s) => s.done)
  if (allDone) return null

  const nextIdx = steps.findIndex((s) => !s.done)
  const completedCount = steps.filter((s) => s.done).length
  const totalCount = steps.length

  return (
    <div className="mb-6 rounded-md border border-emerald-500/40 bg-emerald-500/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Get to first launch</h2>
          <span className="font-mono-data text-[10px] text-slate-500">{completedCount}/{totalCount}</span>
        </div>
        <div className="hidden md:flex items-center gap-1">
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={cn(
                'h-1.5 w-8 rounded-full',
                s.done ? 'bg-emerald-400' : i === nextIdx ? 'bg-emerald-400/40' : 'bg-slate-700',
              )}
            />
          ))}
        </div>
      </div>

      <ul className="divide-y divide-slate-800">
        {steps.map((s, i) => {
          const isNext = i === nextIdx
          return (
            <li
              key={s.key}
              className={cn(
                'flex items-start gap-3 px-4 py-3',
                s.done && 'opacity-50',
                isNext && 'bg-emerald-500/[0.04]',
              )}
            >
              <div className="shrink-0 pt-0.5">
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Circle className={cn('h-4 w-4', isNext ? 'text-emerald-400' : 'text-slate-600')} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={cn('text-sm font-semibold', s.done ? 'text-slate-400 line-through' : 'text-slate-100')}>
                  {s.title}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">{s.description}</p>
              </div>
              {!s.done && isNext && (
                <Link
                  href={s.href}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
                >
                  {s.cta}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
