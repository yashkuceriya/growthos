'use client'

import { useEffect, useState } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { Mail, Book, Bug, ExternalLink } from 'lucide-react'
import type { IntegrationHealth } from '@/app/api/dashboard/health/route'

// Real links — no `#` placeholders. The API Reference lives inside the
// app at /settings; community chat is intentionally absent until we
// actually have a community to send people to (don't lie about it).
const LINKS = [
  {
    icon: Book,
    title: 'API Reference',
    desc: 'Endpoints, scopes, idempotency, webhook events. Auto-generated from the live registry.',
    href: '/settings',
    internal: true,
  },
  {
    icon: Bug,
    title: 'Report an Issue',
    desc: 'File bugs or request features on GitHub.',
    href: 'https://github.com/yashkuceriya/growthos/issues',
    internal: false,
  },
  {
    icon: Mail,
    title: 'Email Support',
    desc: 'Direct line for account / billing / urgent issues.',
    href: 'mailto:yash.vijay.kucheriya@challenger.gauntletai.com',
    internal: false,
  },
] as const

export default function SupportPage() {
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/health')
      .then((r) => r.json())
      .then((j) => setIntegrations(j.integrations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <PageShell>
      <PageHeader title="Support" subtitle="Get help running your marketing command center" />
      <div className="grid grid-cols-2 gap-3">
        {LINKS.map(({ icon: Icon, title, desc, href, internal }) => (
          <a
            key={title}
            href={href}
            target={internal ? undefined : '_blank'}
            rel={internal ? undefined : 'noreferrer'}
            className="group rounded-md border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-500/40 hover:bg-slate-900/80"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1">
                  {title}
                  {!internal && <ExternalLink className="h-3 w-3 text-slate-500" />}
                </h3>
                <p className="mt-1 text-xs text-slate-400">{desc}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Real system status: shows what's configured, not a hardcoded
          everything-is-fine list. */}
      <SectionPanel className="mt-4" title="System Status">
        {loading ? (
          <p className="text-xs text-slate-500">Checking…</p>
        ) : integrations.length === 0 ? (
          <p className="text-xs text-slate-500">No data</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {integrations.map((i) => {
              const dotClass =
                i.status === 'ok' ? 'bg-emerald-400' :
                i.status === 'warn' ? 'bg-amber-400' :
                i.status === 'error' ? 'bg-rose-400' :
                'bg-slate-600'
              const label =
                i.status === 'ok' ? 'OPERATIONAL' :
                i.status === 'warn' ? 'DEGRADED' :
                i.status === 'error' ? 'NEEDS CONFIG' :
                'OPTIONAL'
              const labelColor =
                i.status === 'ok' ? 'text-emerald-400' :
                i.status === 'warn' ? 'text-amber-400' :
                i.status === 'error' ? 'text-rose-400' :
                'text-slate-500'
              return (
                <li key={i.name} className="flex items-center justify-between">
                  <span className="text-slate-300">{i.name}</span>
                  <span className={`flex items-center gap-1.5 font-mono-data text-[10px] ${labelColor}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                    {label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </SectionPanel>
    </PageShell>
  )
}
