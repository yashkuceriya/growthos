'use client'

import { useState } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/lib/utils'
import { Key, Plug, User, Users as TeamIcon, CreditCard, Eye, EyeOff } from 'lucide-react'

const SECTIONS = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'api-keys', label: 'API Keys', icon: Key },
  { key: 'integrations', label: 'Integrations', icon: Plug },
  { key: 'team', label: 'Team', icon: TeamIcon },
  { key: 'billing', label: 'Billing', icon: CreditCard },
] as const

const KEYS = [
  { label: 'OpenRouter API Key', value: 'sk-or-v1-••••••••••••••••••••••••••••', env: 'OPENROUTER_API_KEY' },
  { label: 'Resend API Key', value: 're_••••••••••••••••••••••••', env: 'RESEND_API_KEY' },
  { label: 'Supabase Service Role', value: 'eyJ••••••••••••••••••••••••••••', env: 'SUPABASE_SERVICE_ROLE_KEY' },
]

const INTEGRATIONS = [
  { name: 'Google Ads', status: 'connected' as const, detail: 'Connected — v14.1' },
  { name: 'Meta Graph', status: 'connected' as const, detail: 'Live — 2 accounts' },
  { name: 'TikTok Pixel', status: 'error' as const, detail: 'Reauth required' },
  { name: 'SendGrid', status: 'connected' as const, detail: '99.5% deliverability' },
]

export default function SettingsPage() {
  const [section, setSection] = useState<typeof SECTIONS[number]['key']>('api-keys')
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  return (
    <PageShell>
      <PageHeader title="Settings" subtitle="Manage your GrowthOS configuration" />

      <div className="grid grid-cols-12 gap-4">
        <nav className="col-span-3">
          <SectionPanel contentClassName="p-2">
            <ul className="space-y-0.5">
              {SECTIONS.map(({ key, label, icon: Icon }) => (
                <li key={key}>
                  <button
                    onClick={() => setSection(key)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      section === key ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </SectionPanel>
        </nav>

        <div className="col-span-9">
          {section === 'api-keys' && (
            <SectionPanel title="API Keys">
              <ul className="space-y-3">
                {KEYS.map((k) => (
                  <li key={k.env} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{k.label}</div>
                        <div className="font-mono-data text-[10px] text-slate-500">{k.env}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setRevealed((r) => ({ ...r, [k.env]: !r[k.env] }))} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-slate-400 hover:text-slate-100">
                          {revealed[k.env] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-100">Rotate</button>
                      </div>
                    </div>
                    <code className="block font-mono-data text-xs text-slate-400 truncate">
                      {revealed[k.env] ? 'sk-or-v1-abc123def456ghi789jkl012mno345pqr' : k.value}
                    </code>
                  </li>
                ))}
              </ul>
            </SectionPanel>
          )}

          {section === 'integrations' && (
            <SectionPanel title="Integrations">
              <div className="grid grid-cols-2 gap-3">
                {INTEGRATIONS.map((i) => (
                  <div key={i.name} className="rounded-md border border-slate-800 bg-slate-800/40 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-semibold text-slate-100">{i.name}</h3>
                      <StatusPill tone={i.status === 'connected' ? 'success' : 'error'}>
                        {i.status === 'connected' ? 'Connected' : 'Action Required'}
                      </StatusPill>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{i.detail}</p>
                    <button className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/60">
                      {i.status === 'connected' ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </SectionPanel>
          )}

          {section !== 'api-keys' && section !== 'integrations' && (
            <SectionPanel title={SECTIONS.find((s) => s.key === section)?.label}>
              <p className="text-sm text-slate-500">Coming soon.</p>
            </SectionPanel>
          )}
        </div>
      </div>
    </PageShell>
  )
}
