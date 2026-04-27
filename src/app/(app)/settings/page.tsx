'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Key, Plug, User, Users as TeamIcon, CreditCard, Plus, Copy, Trash2, Share2, MessageCircle, Briefcase, Webhook, Power, ChevronDown, ChevronRight, Send, RefreshCw, BookOpen } from 'lucide-react'
import { WebhookVerifySnippet } from '@/components/ui/webhook-verify-snippet'
import { WEBHOOK_EVENTS } from '@/lib/webhooks/events'
import { ApiReference } from '@/components/ui/api-reference'
import { useProject } from '@/hooks/use-project'
import type { IntegrationHealth } from '@/app/api/dashboard/health/route'

const SECTIONS = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'api-keys', label: 'API Keys', icon: Key },
  { key: 'webhooks', label: 'Webhooks', icon: Webhook },
  { key: 'api-reference', label: 'API Reference', icon: BookOpen },
  { key: 'social-accounts', label: 'Social Accounts', icon: Share2 },
  { key: 'integrations', label: 'Integrations', icon: Plug },
  { key: 'team', label: 'Team', icon: TeamIcon },
  { key: 'billing', label: 'Billing', icon: CreditCard },
] as const

// Derived from the webhook events registry (single source of truth).
const WEBHOOK_EVENT_OPTIONS = WEBHOOK_EVENTS.map((e) => ({
  value: e.name,
  label: e.label,
  hint: e.hint,
}))

const SOCIAL_PLATFORMS = [
  { value: 'twitter', label: 'Twitter / X', icon: MessageCircle, hint: 'OAuth 2.0 user access token with tweet.write scope' },
  { value: 'linkedin', label: 'LinkedIn', icon: Briefcase, hint: 'Access token with w_member_social scope. external_account_id should be `urn:li:person:<id>`' },
] as const

interface SocialAccountRow {
  id: string
  project_id: string
  platform: string
  account_name: string | null
  external_account_id: string | null
  scopes: string[]
  expires_at: string | null
  last_publish_at: string | null
  last_error: string | null
  connected_at: string
}

// Integrations panel reads from /api/dashboard/health for real env-var
// presence + activity-anchored status. No hardcoded list.

const SCOPE_OPTIONS = [
  { value: 'leads:write', label: 'Write leads', hint: 'POST /api/v1/leads' },
  { value: 'projects:ingest', label: 'Trigger ingest', hint: 'POST /api/v1/projects/:id/ingest' },
  { value: 'projects:read', label: 'Read projects', hint: 'GET /api/v1/projects' },
  { value: 'webhooks:write', label: 'Manage webhooks', hint: 'POST/DELETE /api/v1/webhooks' },
] as const

interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

function isActive(k: ApiKeyRow, nowMs: number): boolean {
  if (k.revoked_at) return false
  if (!k.expires_at) return true
  return new Date(k.expires_at).getTime() > nowMs
}

export default function SettingsPage() {
  const { activeProject } = useProject()
  const [section, setSection] = useState<typeof SECTIONS[number]['key']>('api-keys')
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [mintOpen, setMintOpen] = useState(false)
  const [mintName, setMintName] = useState('')
  const [mintScopes, setMintScopes] = useState<Set<string>>(new Set())
  const [mintExpiresDays, setMintExpiresDays] = useState('')
  const [minting, setMinting] = useState(false)
  const [newKeyPlain, setNewKeyPlain] = useState<string | null>(null)

  const [socialAccounts, setSocialAccounts] = useState<SocialAccountRow[]>([])
  const [loadingSocial, setLoadingSocial] = useState(false)
  const [socialOpen, setSocialOpen] = useState(false)
  const [socialPlatform, setSocialPlatform] = useState<typeof SOCIAL_PLATFORMS[number]['value']>('twitter')
  const [socialToken, setSocialToken] = useState('')
  const [socialAccountName, setSocialAccountName] = useState('')
  const [socialExternalId, setSocialExternalId] = useState('')
  const [socialSaving, setSocialSaving] = useState(false)

  const refreshSocial = useCallback(async () => {
    if (!activeProject) return
    setLoadingSocial(true)
    const res = await fetch(`/api/social/accounts?project_id=${activeProject.id}`)
    const json = await res.json()
    setSocialAccounts(json.accounts ?? [])
    setLoadingSocial(false)
  }, [activeProject])

  useEffect(() => {
    if (section === 'social-accounts' && activeProject) void refreshSocial()
  }, [section, activeProject, refreshSocial])

  async function connectSocial(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setSocialSaving(true)
    const res = await fetch('/api/social/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: activeProject.id,
        platform: socialPlatform,
        access_token: socialToken,
        account_name: socialAccountName || undefined,
        external_account_id: socialExternalId || undefined,
      }),
    })
    const json = await res.json()
    if (!res.ok) toast.error(json.error ?? 'Connect failed')
    else {
      toast.success(`${socialPlatform} connected`)
      setSocialOpen(false); setSocialToken(''); setSocialAccountName(''); setSocialExternalId('')
      await refreshSocial()
    }
    setSocialSaving(false)
  }

  async function disconnectSocial(id: string) {
    if (!confirm('Disconnect this account? Scheduled posts will fail until reconnected.')) return
    const res = await fetch('/api/social/accounts', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) { toast.success('Disconnected'); await refreshSocial() } else toast.error('Disconnect failed')
  }

  const refreshKeys = useCallback(async () => {
    setLoadingKeys(true)
    const res = await fetch('/api/api-keys')
    const json = await res.json()
    setKeys(json.keys ?? [])
    setLoadingKeys(false)
  }, [])

  useEffect(() => {
    if (section !== 'api-keys') return
    // Trigger fetch on mount and when section flips to api-keys. Effect only
    // synchronizes fetch → state; cascading renders are bounded to once per
    // section change. Linter wants us to move this elsewhere but fetch on
    // mount is a legitimate use of effects.
    void refreshKeys()
  }, [section, refreshKeys])

  async function mintKey(e: React.FormEvent) {
    e.preventDefault()
    setMinting(true)
    const res = await fetch('/api/api-keys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: mintName,
        scopes: Array.from(mintScopes),
        expires_in_days: mintExpiresDays ? Number(mintExpiresDays) : undefined,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Mint failed')
    } else {
      setNewKeyPlain(json.key)
      setMintOpen(false)
      setMintName(''); setMintScopes(new Set()); setMintExpiresDays('')
      await refreshKeys()
    }
    setMinting(false)
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this key? External integrations using it will stop working immediately.')) return
    const res = await fetch('/api/api-keys', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) { toast.success('Revoked'); await refreshKeys() } else toast.error('Revoke failed')
  }

  function toggleScope(scope: string) {
    setMintScopes((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope); else next.add(scope)
      return next
    })
  }

  // ── Webhooks ───────────────────────────────────────────────────────────
  interface WebhookRow {
    id: string
    project_id: string | null
    url: string
    events: string[]
    active: boolean
    consecutive_failures: number
    last_delivery_at: string | null
    last_delivery_status: 'success' | 'failed' | null
    created_at: string
  }
  interface DeliveryRow {
    id: string
    event_type: string
    status: 'pending' | 'delivering' | 'success' | 'failed' | 'exhausted'
    attempts: number
    response_status: number | null
    error: string | null
    delivered_at: string | null
    created_at: string
  }

  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [loadingWebhooks, setLoadingWebhooks] = useState(false)
  const [whCreateOpen, setWhCreateOpen] = useState(false)
  const [whUrl, setWhUrl] = useState('')
  const [whEvents, setWhEvents] = useState<Set<string>>(new Set())
  const [whProjectScope, setWhProjectScope] = useState<'all' | 'active'>('all')
  const [whCreating, setWhCreating] = useState(false)
  const [whNewSecret, setWhNewSecret] = useState<string | null>(null)
  const [whExpandedId, setWhExpandedId] = useState<string | null>(null)
  const [whDeliveries, setWhDeliveries] = useState<Record<string, DeliveryRow[]>>({})
  const [whDeliveriesLoading, setWhDeliveriesLoading] = useState<string | null>(null)

  const refreshWebhooks = useCallback(async () => {
    setLoadingWebhooks(true)
    const res = await fetch('/api/webhook-endpoints')
    const json = await res.json()
    setWebhooks(json.endpoints ?? [])
    setLoadingWebhooks(false)
  }, [])

  useEffect(() => {
    if (section === 'webhooks') void refreshWebhooks()
  }, [section, refreshWebhooks])

  // Real integrations status — derived from env-var presence + activity
  // ledger probes server-side. Replaces what used to be a hardcoded fake.
  const [integrationsList, setIntegrationsList] = useState<IntegrationHealth[]>([])
  const [integrationsLoading, setIntegrationsLoading] = useState(false)
  useEffect(() => {
    if (section !== 'integrations') return
    setIntegrationsLoading(true)
    fetch('/api/dashboard/health')
      .then((r) => r.json())
      .then((j) => setIntegrationsList(j.integrations ?? []))
      .catch(() => {})
      .finally(() => setIntegrationsLoading(false))
  }, [section])

  function toggleWebhookEvent(ev: string) {
    setWhEvents((prev) => {
      const next = new Set(prev)
      if (next.has(ev)) next.delete(ev); else next.add(ev)
      return next
    })
  }

  async function createWebhook(e: React.FormEvent) {
    e.preventDefault()
    setWhCreating(true)
    const projectId = whProjectScope === 'active' && activeProject ? activeProject.id : null
    const res = await fetch('/api/webhook-endpoints', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: whUrl,
        events: Array.from(whEvents),
        project_id: projectId,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Create failed')
    } else {
      setWhNewSecret(json.secret)
      setWhCreateOpen(false)
      setWhUrl(''); setWhEvents(new Set()); setWhProjectScope('all')
      await refreshWebhooks()
    }
    setWhCreating(false)
  }

  async function deleteWebhook(id: string) {
    if (!confirm('Delete this webhook endpoint? Pending deliveries will be cancelled.')) return
    const res = await fetch(`/api/webhook-endpoints/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); await refreshWebhooks() } else toast.error('Delete failed')
  }

  async function toggleWebhookActive(row: WebhookRow) {
    const res = await fetch(`/api/webhook-endpoints/${row.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !row.active }),
    })
    if (res.ok) {
      toast.success(row.active ? 'Disabled' : 'Re-enabled')
      await refreshWebhooks()
    } else {
      toast.error('Update failed')
    }
  }

  async function sendTestWebhook(id: string) {
    const res = await fetch(`/api/webhook-endpoints/${id}/test`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Test failed')
      return
    }
    if (json.final_status === 'success') toast.success('Test delivered (2xx)')
    else if (json.final_status === 'pending') toast.warning('Receiver returned a transient error — will retry')
    else toast.error(`Test ${json.final_status}`)
    // Refresh deliveries panel so the user sees the row immediately.
    setWhDeliveries((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (whExpandedId === id) {
      setWhDeliveriesLoading(id)
      const dRes = await fetch(`/api/webhook-endpoints/${id}/deliveries`)
      const dJson = await dRes.json()
      setWhDeliveries((prev) => ({ ...prev, [id]: dJson.deliveries ?? [] }))
      setWhDeliveriesLoading(null)
    }
    await refreshWebhooks()
  }

  async function redriveDelivery(endpointId: string, deliveryId: string) {
    const res = await fetch(`/api/webhook-endpoints/${endpointId}/deliveries/${deliveryId}/redrive`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'Retry failed')
      return
    }
    if (json.final_status === 'success') toast.success('Retry delivered')
    else if (json.final_status === 'pending') toast.warning('Still failing — scheduled for next attempt')
    else toast.error(`Retry ${json.final_status}`)
    // Refresh just this endpoint's deliveries.
    setWhDeliveriesLoading(endpointId)
    const dRes = await fetch(`/api/webhook-endpoints/${endpointId}/deliveries`)
    const dJson = await dRes.json()
    setWhDeliveries((prev) => ({ ...prev, [endpointId]: dJson.deliveries ?? [] }))
    setWhDeliveriesLoading(null)
    await refreshWebhooks()
  }

  async function expandWebhook(id: string) {
    if (whExpandedId === id) {
      setWhExpandedId(null)
      return
    }
    setWhExpandedId(id)
    if (!whDeliveries[id]) {
      setWhDeliveriesLoading(id)
      const res = await fetch(`/api/webhook-endpoints/${id}/deliveries`)
      const json = await res.json()
      setWhDeliveries((prev) => ({ ...prev, [id]: json.deliveries ?? [] }))
      setWhDeliveriesLoading(null)
    }
  }

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
            <>
              <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
                <BookOpen className="h-3 w-3 text-emerald-400" />
                <span>Each scope maps to specific endpoints.</span>
                <button onClick={() => setSection('api-reference')} className="ml-auto font-semibold text-emerald-300 hover:text-emerald-200">View API Reference →</button>
              </div>
            <SectionPanel
              title="Personal API Keys"
              action={
                <Dialog open={mintOpen} onOpenChange={setMintOpen}>
                  <DialogTrigger>
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                      <Plus className="h-3.5 w-3.5" /> Mint Key
                    </div>
                  </DialogTrigger>
                  <DialogContent className="border-slate-700 bg-slate-900 max-w-md">
                    <DialogHeader><DialogTitle className="text-slate-100">Mint API key</DialogTitle></DialogHeader>
                    <form onSubmit={mintKey} className="space-y-3">
                      <input
                        required placeholder="Key name (e.g. Zapier, Marketing Site)"
                        value={mintName} onChange={(e) => setMintName(e.target.value)}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                      />
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Scopes</div>
                        <div className="space-y-2">
                          {SCOPE_OPTIONS.map((opt) => (
                            <label key={opt.value} className="flex items-start gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs cursor-pointer hover:bg-slate-800">
                              <input
                                type="checkbox"
                                checked={mintScopes.has(opt.value)}
                                onChange={() => toggleScope(opt.value)}
                                className="mt-0.5 accent-emerald-500"
                              />
                              <div>
                                <div className="font-semibold text-slate-100">{opt.label}</div>
                                <div className="text-[10px] font-mono-data text-slate-500">{opt.hint}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Expires in days (blank = never)</div>
                        <input
                          type="number" min="1" placeholder="e.g. 90"
                          value={mintExpiresDays} onChange={(e) => setMintExpiresDays(e.target.value)}
                          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <button type="submit" disabled={minting || mintScopes.size === 0 || !mintName} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                        {minting ? 'Minting…' : 'Mint Key'}
                      </button>
                    </form>
                  </DialogContent>
                </Dialog>
              }
            >
              {newKeyPlain && (
                <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Copy now — this is the only time it will be shown</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-slate-900 px-3 py-2 font-mono-data text-xs text-slate-100 break-all">{newKeyPlain}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(newKeyPlain); toast.success('Copied') }}
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setNewKeyPlain(null)}
                      className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {loadingKeys ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : keys.length === 0 ? (
                <div className="py-8 text-center">
                  <Key className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">No API keys yet. Mint one to let external tools hit <code className="font-mono-data text-[11px] text-emerald-300">/api/v1/*</code>.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {keys.map((k) => {
                    // eslint-disable-next-line react-hooks/purity
                    const active = isActive(k, Date.now())
                    return (
                      <li key={k.id} className={cn('rounded-md border p-3', active ? 'border-slate-800 bg-slate-800/40' : 'border-slate-800 bg-slate-900/40 opacity-70')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-semibold text-slate-100">{k.name}</span>
                              <StatusPill tone={active ? 'success' : 'neutral'}>
                                {k.revoked_at ? 'Revoked' : active ? 'Active' : 'Expired'}
                              </StatusPill>
                            </div>
                            <code className="block font-mono-data text-[11px] text-slate-400">{k.prefix}…</code>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {k.scopes.map((s) => <StatusPill key={s} tone="info">{s}</StatusPill>)}
                            </div>
                            <div className="mt-1 text-[10px] font-mono-data text-slate-500">
                              Created {new Date(k.created_at).toLocaleDateString()}
                              {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleString()}`}
                              {k.expires_at && ` · Expires ${new Date(k.expires_at).toLocaleDateString()}`}
                            </div>
                          </div>
                          {active && (
                            <button
                              onClick={() => revokeKey(k.id)}
                              className="shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300 hover:bg-slate-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </SectionPanel>
            </>
          )}

          {section === 'webhooks' && (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
                <BookOpen className="h-3 w-3 text-emerald-400" />
                <span>Event payload schemas + endpoint docs live in the API Reference.</span>
                <button onClick={() => setSection('api-reference')} className="ml-auto font-semibold text-emerald-300 hover:text-emerald-200">View API Reference →</button>
              </div>
            <SectionPanel
              title="Outbound Webhooks"
              action={
                <Dialog open={whCreateOpen} onOpenChange={setWhCreateOpen}>
                  <DialogTrigger>
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                      <Plus className="h-3.5 w-3.5" /> Add Endpoint
                    </div>
                  </DialogTrigger>
                  <DialogContent className="border-slate-700 bg-slate-900 max-w-md">
                    <DialogHeader><DialogTitle className="text-slate-100">Add webhook endpoint</DialogTitle></DialogHeader>
                    <form onSubmit={createWebhook} className="space-y-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Endpoint URL</div>
                        <input
                          required type="url" placeholder="https://your-app.com/webhooks/growthos"
                          value={whUrl} onChange={(e) => setWhUrl(e.target.value)}
                          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Events</div>
                        <div className="space-y-2">
                          {WEBHOOK_EVENT_OPTIONS.map((opt) => (
                            <label key={opt.value} className="flex items-start gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs cursor-pointer hover:bg-slate-800">
                              <input
                                type="checkbox"
                                checked={whEvents.has(opt.value)}
                                onChange={() => toggleWebhookEvent(opt.value)}
                                className="mt-0.5 accent-emerald-500"
                              />
                              <div>
                                <div className="font-mono-data text-slate-100">{opt.value}</div>
                                <div className="text-[10px] text-slate-500">{opt.hint}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Scope</div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className={cn('rounded-md border px-3 py-2 text-xs cursor-pointer text-center', whProjectScope === 'all' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:bg-slate-800')}>
                            <input type="radio" name="wh-scope" checked={whProjectScope === 'all'} onChange={() => setWhProjectScope('all')} className="hidden" />
                            All projects
                          </label>
                          <label className={cn('rounded-md border px-3 py-2 text-xs cursor-pointer text-center', whProjectScope === 'active' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:bg-slate-800', !activeProject && 'opacity-40 cursor-not-allowed')}>
                            <input type="radio" name="wh-scope" disabled={!activeProject} checked={whProjectScope === 'active'} onChange={() => setWhProjectScope('active')} className="hidden" />
                            {activeProject ? activeProject.name : 'Active project'}
                          </label>
                        </div>
                      </div>
                      <button type="submit" disabled={whCreating || !whUrl || whEvents.size === 0} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                        {whCreating ? 'Creating…' : 'Add Endpoint'}
                      </button>
                    </form>
                  </DialogContent>
                </Dialog>
              }
            >
              {whNewSecret && (
                <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Signing secret — copy now, this is the only time it will be shown</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-slate-900 px-3 py-2 font-mono-data text-xs text-slate-100 break-all">{whNewSecret}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(whNewSecret); toast.success('Copied') }}
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setWhNewSecret(null)}
                      className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-100"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="mt-3 text-[10px] text-slate-500">
                    Verify with HMAC-SHA256 over <code className="font-mono-data text-slate-400">{`${'${'}timestamp${'}'}.${'${'}rawBody${'}'}`}</code>. Header format: <code className="font-mono-data text-slate-400">x-growthos-signature: t=&lt;seconds&gt;,v1=&lt;hex&gt;</code>. Reject timestamps older than 5 min.
                  </div>
                  <div className="mt-3">
                    <WebhookVerifySnippet />
                  </div>
                </div>
              )}

              {loadingWebhooks ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : webhooks.length === 0 ? (
                <div className="py-8 text-center">
                  <Webhook className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">No webhook endpoints. Add one to get notified when ingest jobs finish.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {webhooks.map((w) => {
                    const expanded = whExpandedId === w.id
                    const deliveries = whDeliveries[w.id]
                    return (
                      <li key={w.id} className={cn('rounded-md border p-3', w.active ? 'border-slate-800 bg-slate-800/40' : 'border-slate-800 bg-slate-900/40 opacity-70')}>
                        <div className="flex items-start justify-between gap-3">
                          <button onClick={() => expandWebhook(w.id)} className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {expanded ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                              <code className="font-mono-data text-xs text-slate-100 truncate">{w.url}</code>
                              <StatusPill tone={w.active ? 'success' : 'neutral'}>
                                {w.active ? 'Active' : 'Disabled'}
                              </StatusPill>
                              {w.consecutive_failures > 0 && (
                                <StatusPill tone="warn">{w.consecutive_failures} consecutive fails</StatusPill>
                              )}
                              {w.project_id == null && (
                                <StatusPill tone="info">All projects</StatusPill>
                              )}
                            </div>
                            <div className="ml-5 flex flex-wrap gap-1">
                              {w.events.map((e) => <StatusPill key={e} tone="info">{e}</StatusPill>)}
                            </div>
                            <div className="ml-5 mt-1 text-[10px] font-mono-data text-slate-500">
                              Created {new Date(w.created_at).toLocaleDateString()}
                              {w.last_delivery_at && ` · Last ${w.last_delivery_status ?? 'delivery'} ${new Date(w.last_delivery_at).toLocaleString()}`}
                            </div>
                          </button>
                          <div className="shrink-0 flex gap-1">
                            <button
                              onClick={() => sendTestWebhook(w.id)}
                              title="Send test event"
                              className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 hover:bg-slate-700"
                            >
                              <Send className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => toggleWebhookActive(w)}
                              title={w.active ? 'Disable' : 'Re-enable'}
                              className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-700"
                            >
                              <Power className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => deleteWebhook(w.id)}
                              title="Delete"
                              className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300 hover:bg-slate-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="mt-3 ml-5 border-t border-slate-800 pt-3 space-y-3">
                            <WebhookVerifySnippet />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Recent deliveries</div>
                            {whDeliveriesLoading === w.id ? (
                              <p className="text-xs text-slate-500">Loading…</p>
                            ) : !deliveries || deliveries.length === 0 ? (
                              <p className="text-xs text-slate-500">No deliveries yet.</p>
                            ) : (
                              <ul className="space-y-1">
                                {deliveries.map((d) => {
                                  const tone: 'success' | 'info' | 'warn' = d.status === 'success' ? 'success' : d.status === 'pending' || d.status === 'delivering' ? 'info' : 'warn'
                                  const canRedrive = d.status === 'failed' || d.status === 'exhausted'
                                  return (
                                    <li key={d.id} className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-[11px]">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <StatusPill tone={tone}>{d.status}</StatusPill>
                                        <code className="font-mono-data text-slate-300">{d.event_type}</code>
                                        {d.response_status != null && (
                                          <span className="font-mono-data text-slate-500">HTTP {d.response_status}</span>
                                        )}
                                        <span className="font-mono-data text-slate-500">attempt {d.attempts}</span>
                                        <span className="ml-auto font-mono-data text-slate-500">{new Date(d.created_at).toLocaleString()}</span>
                                        {canRedrive && (
                                          <button
                                            onClick={() => redriveDelivery(w.id, d.id)}
                                            title="Retry now"
                                            className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 hover:bg-slate-700"
                                          >
                                            <RefreshCw className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                      {d.error && (
                                        <div className="mt-1 font-mono-data text-[10px] text-rose-300 break-all">{d.error}</div>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </SectionPanel>
            </>
          )}

          {section === 'social-accounts' && (
            <SectionPanel
              title={`Social Accounts${activeProject ? ` · ${activeProject.name}` : ''}`}
              action={
                <Dialog open={socialOpen} onOpenChange={setSocialOpen}>
                  <DialogTrigger>
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                      <Plus className="h-3.5 w-3.5" /> Connect
                    </div>
                  </DialogTrigger>
                  <DialogContent className="border-slate-700 bg-slate-900 max-w-lg">
                    <DialogHeader><DialogTitle className="text-slate-100">Connect social account</DialogTitle></DialogHeader>
                    <form onSubmit={connectSocial} className="space-y-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Platform</div>
                        <select value={socialPlatform} onChange={(e) => setSocialPlatform(e.target.value as typeof socialPlatform)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                          {SOCIAL_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <p className="mt-1 text-[10px] text-slate-500">{SOCIAL_PLATFORMS.find((p) => p.value === socialPlatform)?.hint}</p>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Access token</div>
                        <textarea required rows={3} value={socialToken} onChange={(e) => setSocialToken(e.target.value)} placeholder="Paste OAuth access token" className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-mono-data text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                        <p className="mt-1 text-[10px] text-slate-500">Encrypted at rest with AES-256-GCM. Never displayed back.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={socialAccountName} onChange={(e) => setSocialAccountName(e.target.value)} placeholder="Display name (optional)" className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                        <input value={socialExternalId} onChange={(e) => setSocialExternalId(e.target.value)} placeholder={socialPlatform === 'linkedin' ? 'urn:li:person:xxxx' : 'X user id (optional)'} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                      </div>
                      <button type="submit" disabled={socialSaving || !socialToken || !activeProject} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                        {socialSaving ? 'Connecting…' : 'Connect Account'}
                      </button>
                    </form>
                  </DialogContent>
                </Dialog>
              }
            >
              {!activeProject ? (
                <p className="text-sm text-slate-500">Select a project from the sidebar to manage its social accounts.</p>
              ) : loadingSocial ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : socialAccounts.length === 0 ? (
                <div className="py-8 text-center">
                  <Share2 className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">No accounts connected. Connect Twitter or LinkedIn to enable scheduled publishing.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {socialAccounts.map((a) => {
                    const Icon = SOCIAL_PLATFORMS.find((p) => p.value === a.platform)?.icon ?? Share2
                    // eslint-disable-next-line react-hooks/purity
                    const expired = a.expires_at && new Date(a.expires_at).getTime() < Date.now()
                    return (
                      <li key={a.id} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Icon className="h-4 w-4 text-emerald-400" />
                              <span className="text-sm font-semibold text-slate-100">{a.account_name ?? a.platform}</span>
                              <StatusPill tone={expired ? 'error' : a.last_error ? 'error' : 'success'}>
                                {expired ? 'Expired' : a.last_error ? 'Error' : 'Connected'}
                              </StatusPill>
                            </div>
                            {a.external_account_id && <code className="block font-mono-data text-[11px] text-slate-400">{a.external_account_id}</code>}
                            <div className="mt-1 text-[10px] font-mono-data text-slate-500">
                              Connected {new Date(a.connected_at).toLocaleDateString()}
                              {a.last_publish_at && ` · Last published ${new Date(a.last_publish_at).toLocaleString()}`}
                              {a.expires_at && ` · Expires ${new Date(a.expires_at).toLocaleDateString()}`}
                            </div>
                            {a.last_error && <p className="mt-1 text-[11px] text-rose-300">{a.last_error}</p>}
                          </div>
                          <button
                            onClick={() => disconnectSocial(a.id)}
                            className="shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300 hover:bg-slate-700"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </SectionPanel>
          )}

          {section === 'integrations' && (
            <SectionPanel title="Integrations">
              <p className="mb-4 text-xs text-slate-400">
                Status of every external service GrowthOS depends on. Required services must be configured for the system to work; optional services unlock additional capability when enabled.
              </p>
              {integrationsLoading && integrationsList.length === 0 ? (
                <p className="text-xs text-slate-500">Checking…</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {integrationsList.map((i) => {
                    const tone =
                      i.status === 'ok' ? 'success' :
                      i.status === 'warn' ? 'warn' :
                      i.status === 'error' ? 'error' :
                      'neutral'
                    const label =
                      i.status === 'ok' ? 'OK' :
                      i.status === 'warn' ? 'Action needed' :
                      i.status === 'error' ? 'Required' :
                      i.configured ? 'Configured' : 'Not configured'
                    return (
                      <div key={i.name} className="rounded-md border border-slate-800 bg-slate-800/40 p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-sm font-semibold text-slate-100">{i.name}</h3>
                          <StatusPill tone={tone}>{label}</StatusPill>
                        </div>
                        <p className="text-xs text-slate-400">{i.detail}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionPanel>
          )}

          {section === 'api-reference' && (
            <SectionPanel title="API Reference">
              <ApiReference />
            </SectionPanel>
          )}

          {section !== 'api-keys' && section !== 'integrations' && section !== 'social-accounts' && section !== 'webhooks' && section !== 'api-reference' && (
            <SectionPanel title={SECTIONS.find((s) => s.key === section)?.label}>
              <p className="text-sm text-slate-500">Coming soon.</p>
            </SectionPanel>
          )}
        </div>
      </div>
    </PageShell>
  )
}
