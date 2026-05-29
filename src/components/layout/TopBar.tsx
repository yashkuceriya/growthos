'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  DollarSign,
  FileText,
  HelpCircle,
  Megaphone,
  Rocket,
  Search,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { useProject } from '@/hooks/use-project'
import { cn } from '@/lib/utils'
import type { IntegrationHealth } from '@/app/api/dashboard/health/route'

type Command = {
  href: string
  title: string
  detail: string
  keywords: string
  icon: React.ComponentType<{ className?: string }>
}

const commands: Command[] = [
  {
    href: '/launch',
    title: 'Plan launch',
    detail: 'Build the next campaign plan',
    keywords: 'launch campaign plan sequence',
    icon: Rocket,
  },
  {
    href: '/campaigns',
    title: 'Open campaigns',
    detail: 'Review launches and assets',
    keywords: 'campaigns assets metrics learning',
    icon: Megaphone,
  },
  {
    href: '/ad-studio/generate',
    title: 'Generate ad',
    detail: 'Create new ad variants',
    keywords: 'ad creative generate copy image',
    icon: Zap,
  },
  {
    href: '/content',
    title: 'Draft content',
    detail: 'Create posts and long-form assets',
    keywords: 'content social article post',
    icon: FileText,
  },
  {
    href: '/leads',
    title: 'Review leads',
    detail: 'Inspect captures and pipeline',
    keywords: 'leads contacts subscribers capture',
    icon: Users,
  },
  {
    href: '/analytics',
    title: 'Check analytics',
    detail: 'Compare attribution and campaign signals',
    keywords: 'analytics attribution metrics performance',
    icon: BarChart3,
  },
  {
    href: '/budget',
    title: 'Check budget',
    detail: 'Audit spend and caps',
    keywords: 'budget cost spend cap ai',
    icon: DollarSign,
  },
  {
    href: '/observability',
    title: 'Open health',
    detail: 'Investigate failures and local readiness',
    keywords: 'observability health errors failures local',
    icon: Activity,
  },
  {
    href: '/agency',
    title: 'Open agency',
    detail: 'Strategy and market intelligence',
    keywords: 'agency strategy intelligence positioning',
    icon: Sparkles,
  },
]

export function TopBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { activeProject } = useProject()
  const activeProjectId = activeProject?.id ?? null
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([])
  const [recentIngestStatus, setRecentIngestStatus] = useState<'ok' | 'failing' | 'unknown'>('unknown')

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!activeProjectId) return

    const ctrl = new AbortController()
    fetch(`/api/dashboard/health?project_id=${activeProjectId}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json) return
        setIntegrations(json.integrations ?? [])
        setRecentIngestStatus(json.kpi?.recentIngestStatus ?? 'unknown')
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setRecentIngestStatus('failing')
      })

    return () => ctrl.abort()
  }, [activeProjectId])

  const visibleCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands

    return commands.filter((command) => {
      const haystack = `${command.title} ${command.detail} ${command.keywords}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [query])

  const activeIntegrations = activeProjectId ? integrations : []
  const activeIngestStatus = activeProjectId ? recentIngestStatus : 'unknown'
  const integrationErrors = activeIntegrations.filter((integration) => integration.status === 'error').length
  const integrationWarnings = activeIntegrations.filter((integration) => integration.status === 'warn').length
  const hasHealthIssue = integrationErrors > 0 || activeIngestStatus === 'failing'
  const healthTone = hasHealthIssue ? 'error' : integrationWarnings > 0 ? 'warn' : 'ok'
  const HealthIcon = healthTone === 'ok' ? CheckCircle2 : AlertTriangle

  function navigate(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b border-slate-800 bg-slate-900/80 px-6 backdrop-blur">
      <div className="relative max-w-xl flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            }
            if (event.key === 'Enter' && visibleCommands[0]) {
              navigate(visibleCommands[0].href)
            }
          }}
          placeholder="Find or run action"
          className="h-9 w-full rounded-md border border-slate-700 bg-slate-800/60 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        {open && (
          <div
            className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-md border border-slate-700 bg-slate-950 shadow-2xl"
            onMouseDown={(event) => event.preventDefault()}
          >
            {visibleCommands.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-500">No matching action</div>
            ) : (
              <ul className="max-h-[360px] overflow-y-auto p-1">
                {visibleCommands.map((command) => {
                  const Icon = command.icon
                  const active = pathname === command.href
                  return (
                    <li key={command.href}>
                      <button
                        type="button"
                        onClick={() => navigate(command.href)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                          active
                            ? 'bg-emerald-500/10 text-emerald-200'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{command.title}</span>
                          <span className="block truncate text-xs text-slate-500">{command.detail}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="hidden min-w-0 items-center gap-2 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 md:flex">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
        <span className="truncate text-xs font-medium text-slate-300">
          {activeProject?.name ?? 'No project'}
        </span>
      </div>

      <Link
        href="/observability"
        className={cn(
          'hidden items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors lg:inline-flex',
          healthTone === 'ok' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15',
          healthTone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15',
          healthTone === 'error' && 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15',
        )}
      >
        <HealthIcon className="h-3.5 w-3.5" />
        {healthTone === 'ok' ? 'Healthy' : healthTone === 'warn' ? 'Review' : 'Attention'}
      </Link>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <Bell className="h-4 w-4" />
        </button>
        <Link
          href="/support"
          aria-label="Support"
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>
        <div className="h-8 w-8 rounded-full bg-emerald-500 ring-1 ring-emerald-400/40" />
      </div>
    </header>
  )
}
