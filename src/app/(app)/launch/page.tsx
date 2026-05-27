'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import {
  Rocket, Loader2, CheckCircle2, AlertCircle, ExternalLink, Copy,
  Mail, Music, Search, Users, Globe, FileText, MessageCircle, Briefcase,
  X, Clock, Sparkles, Target, Compass, RefreshCw,
} from 'lucide-react'
// Search icon used in SEO panel; keep explicit import above.
import { cn } from '@/lib/utils'

type ChannelKey = 'meta' | 'linkedin' | 'tiktok' | 'twitter' | 'reddit' | 'email' | 'blog' | 'landing'
type ChannelStatus = 'pending' | 'generating' | 'ready' | 'failed'

interface Channel {
  key: ChannelKey
  label: string
  platform: string
  icon: typeof Rocket
  accent: string
  output_description: string
  deploy_label: string
  deploy_url?: string
}

const CHANNELS: Channel[] = [
  { key: 'meta', label: 'Meta', platform: 'Facebook + Instagram', icon: Mail, accent: 'text-blue-400', output_description: '1 ad creative + 3 image aspects', deploy_label: 'Open Meta Ads Manager', deploy_url: 'https://adsmanager.facebook.com/adsmanager/creation' },
  { key: 'linkedin', label: 'LinkedIn', platform: 'Professional network', icon: Briefcase, accent: 'text-sky-400', output_description: '1 sponsored + 2 organic posts', deploy_label: 'LinkedIn Campaign Manager', deploy_url: 'https://www.linkedin.com/campaignmanager/' },
  { key: 'tiktok', label: 'TikTok', platform: 'Short-form video', icon: Music, accent: 'text-pink-400', output_description: '3 reel scripts + thumbnails', deploy_label: 'TikTok Ads Manager', deploy_url: 'https://ads.tiktok.com/' },
  { key: 'twitter', label: 'Twitter / X', platform: 'Short-form text', icon: MessageCircle, accent: 'text-slate-300', output_description: '1 thread + 2 tweets', deploy_label: 'Compose on X', deploy_url: 'https://twitter.com/compose/tweet' },
  { key: 'reddit', label: 'Reddit', platform: 'Communities', icon: Users, accent: 'text-orange-400', output_description: '3 posts for 3 subreddits', deploy_label: 'Submit to Reddit', deploy_url: 'https://www.reddit.com/submit' },
  { key: 'email', label: 'Email', platform: 'Direct to inbox', icon: Mail, accent: 'text-amber-400', output_description: '3-email welcome sequence', deploy_label: 'Send via Resend', deploy_url: 'https://resend.com/emails' },
  { key: 'blog', label: 'Blog / SEO', platform: 'Organic search', icon: FileText, accent: 'text-cyan-400', output_description: '1 SEO post, 1500 words', deploy_label: 'Open in Content Workshop' },
  { key: 'landing', label: 'Landing Page', platform: 'Conversion', icon: Globe, accent: 'text-emerald-400', output_description: 'Auto-published page', deploy_label: 'View live URL' },
]

interface ChannelState {
  status: ChannelStatus
  ms?: number
  error?: string
}

interface Asset {
  kind: string
  title: string
  body: string
  url?: string
  metadata?: Record<string, unknown>
}

interface LaunchChannelRec {
  channel: ChannelKey
  tier: 'primary' | 'secondary' | 'off'
  reason: string
  defaultOn: boolean
}

interface LaunchPlan {
  vertical: string
  icp: string | null
  primaryGoal: string | null
  primaryKpi: string
  secondaryKpis: string[]
  channels: LaunchChannelRec[]
  defaultChannels: ChannelKey[]
  contentMix: Array<{ label: string; pct: number }>
  launchTactics: string[]
  croFocus: string[]
  lifecycleEmails: string[]
  readiness: Array<{ label: string; ready: boolean; hint: string }>
  suggestedAngles: string[]
  defaultGoal: string
  defaultAngle: string | null
  source: 'classification' | 'fallback'
}

export default function LaunchPage() {
  const { activeProject } = useProject()
  const searchParams = useSearchParams()
  // Optional re-launch flow: a Campaign Command Center "Re-launch" button
  // routes here with ?campaignId=... so new assets reuse the existing
  // campaign id instead of orphaning under a new row.
  const reuseCampaignId = searchParams.get('campaignId')
  const supabase = createClient()

  const [launching, setLaunching] = useState(false)
  const [states, setStates] = useState<Record<ChannelKey, ChannelState>>(() =>
    Object.fromEntries(CHANNELS.map((c) => [c.key, { status: 'pending' as ChannelStatus }])) as Record<ChannelKey, ChannelState>
  )
  const [log, setLog] = useState<Array<{ time: string; text: string }>>([])
  const [drawer, setDrawer] = useState<ChannelKey | null>(null)
  const [assets, setAssets] = useState<Record<ChannelKey, Asset[]>>(() =>
    Object.fromEntries(CHANNELS.map((c) => [c.key, []])) as unknown as Record<ChannelKey, Asset[]>
  )

  // Plan preview state — fetched from /api/launch/plan whenever the active
  // project changes. Operator-editable: channel toggles, campaign goal, and
  // narrative angle override the plan defaults before /api/launch is called.
  const [plan, setPlan] = useState<LaunchPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [selectedChannels, setSelectedChannels] = useState<Set<ChannelKey>>(new Set())
  const [goal, setGoal] = useState<string>('')
  const [angle, setAngle] = useState<string>('')

  // Agent outputs
  type AgentKey = 'cmo' | 'seo' | 'director' | 'analytics'
  interface AgentState { status: 'pending' | 'working' | 'done' | 'failed'; output?: Record<string, unknown>; label?: string }
  const [agents, setAgents] = useState<Record<AgentKey, AgentState>>({
    cmo: { status: 'pending' }, seo: { status: 'pending' },
    director: { status: 'pending' }, analytics: { status: 'pending' },
  })

  // Run-cost transparency: capture the wall-clock at launch start, then
  // sum ai_cost_ledger entries created since for the same project. Lets
  // the operator see what each Launch run actually spent in OpenRouter
  // / Anthropic credits — and which model fired for each agent.
  interface CostBreakdownRow { module: string; model: string | null; cost: number; calls: number }
  const [costBreakdown, setCostBreakdown] = useState<{ total: number; rows: CostBreakdownRow[] } | null>(null)
  const launchStartRef = useState<{ at: string | null }>({ at: null })[0]

  async function refreshCost(projectId: string, sinceIso: string) {
    const { data } = await supabase
      .from('ai_cost_ledger')
      .select('module, model, cost_usd')
      .eq('project_id', projectId)
      .gte('created_at', sinceIso) as { data: Array<{ module: string; model: string | null; cost_usd: number | null }> | null }
    if (!data) return
    const buckets = new Map<string, CostBreakdownRow>()
    for (const r of data) {
      const key = `${r.module}|${r.model ?? ''}`
      const existing = buckets.get(key) ?? { module: r.module, model: r.model, cost: 0, calls: 0 }
      existing.cost += r.cost_usd ?? 0
      existing.calls += 1
      buckets.set(key, existing)
    }
    const rows = Array.from(buckets.values()).sort((a, b) => b.cost - a.cost)
    const total = rows.reduce((s, r) => s + r.cost, 0)
    setCostBreakdown({ total: Math.round(total * 10000) / 10000, rows })
  }

  const bv = activeProject ? (activeProject as unknown as { brand_voice?: Record<string, unknown> }).brand_voice ?? {} : {}
  const hasBrandVoice = typeof bv === 'object' && bv !== null && Object.keys(bv).length > 2

  function appendLog(text: string) {
    setLog((prev) => [{ time: new Date().toLocaleTimeString(), text }, ...prev].slice(0, 50))
  }

  async function refreshAssets(projectId: string) {
    // Re-fetch assets from all relevant tables
    const [ads, social, emailSeq, content, landing] = await Promise.all([
      supabase.from('ad_copies').select('id, headline, primary_text, cta_button, metadata, ad_briefs!inner(platform, project_id)').eq('ad_briefs.project_id', projectId).eq('metadata->>launch_run', 'true').order('created_at', { ascending: false }).limit(20),
      supabase.from('social_posts').select('id, platform, content, metadata').eq('project_id', projectId).eq('metadata->>launch_run', 'true').order('created_at', { ascending: false }).limit(30),
      supabase.from('email_templates').select('id, subject, body_html').eq('project_id', projectId).eq('category', 'welcome').order('created_at', { ascending: false }).limit(10),
      supabase.from('content_pieces').select('id, title, body_markdown').eq('project_id', projectId).eq('metadata->>launch_run', 'true').order('created_at', { ascending: false }).limit(5),
      supabase.from('landing_pages').select('id, name, slug, template').eq('project_id', projectId).order('created_at', { ascending: false }).limit(3),
    ])

    const next: Record<ChannelKey, Asset[]> = Object.fromEntries(CHANNELS.map((c) => [c.key, []])) as unknown as Record<ChannelKey, Asset[]>

    ;(ads.data ?? []).forEach((a: Record<string, unknown>) => {
      const platform = (a.ad_briefs as { platform: string } | undefined)?.platform
      if (platform === 'meta') next.meta.push({ kind: 'ad', title: a.headline as string ?? 'Meta ad', body: `${a.primary_text}\n\nCTA: ${a.cta_button}`, metadata: a })
      if (platform === 'linkedin') next.linkedin.push({ kind: 'ad', title: a.headline as string ?? 'LinkedIn ad', body: a.primary_text as string, metadata: a })
    })
    ;(social.data ?? []).forEach((s: Record<string, unknown>) => {
      const platform = s.platform as ChannelKey
      if (next[platform]) next[platform].push({ kind: platform, title: (s.metadata as Record<string, unknown>)?.title as string ?? `${platform} post`, body: s.content as string, metadata: s })
    })
    ;(emailSeq.data ?? []).forEach((e: Record<string, unknown>) => {
      next.email.push({ kind: 'email', title: e.subject as string, body: e.body_html as string, metadata: e })
    })
    ;(content.data ?? []).forEach((c: Record<string, unknown>) => {
      next.blog.push({ kind: 'blog', title: c.title as string, body: c.body_markdown as string, url: `/content?id=${c.id}`, metadata: c })
    })
    ;(landing.data ?? []).forEach((l: Record<string, unknown>) => {
      const t = l.template as { headline?: string } ?? {}
      next.landing.push({ kind: 'landing', title: t.headline ?? l.name as string, body: `Slug: /p/${l.slug}`, url: `/p/${l.slug}`, metadata: l })
    })

    setAssets(next)
  }

  useEffect(() => {
    if (activeProject) refreshAssets(activeProject.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  async function loadPlan(projectId: string) {
    setPlanLoading(true)
    setPlanError(null)
    try {
      const res = await fetch(`/api/launch/plan?projectId=${encodeURIComponent(projectId)}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
        throw new Error(body.error ?? `Plan request failed: ${res.status}`)
      }
      const body = (await res.json()) as { plan: LaunchPlan }
      setPlan(body.plan)
      setSelectedChannels(new Set(body.plan.defaultChannels))
      setGoal(body.plan.defaultGoal)
      setAngle(body.plan.defaultAngle ?? '')
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to load plan')
    } finally {
      setPlanLoading(false)
    }
  }

  useEffect(() => {
    if (activeProject) loadPlan(activeProject.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  function toggleChannel(channel: ChannelKey) {
    setSelectedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(channel)) next.delete(channel)
      else next.add(channel)
      return next
    })
  }

  async function handleLaunch() {
    if (!activeProject) return
    if (!hasBrandVoice) {
      toast.error('Sync the project website first (Projects → Sync Site)')
      return
    }
    if (selectedChannels.size === 0) {
      toast.error('Select at least one channel to launch')
      return
    }

    setLaunching(true)
    setStates(Object.fromEntries(CHANNELS.map((c) => [c.key, { status: 'generating' as ChannelStatus }])) as Record<ChannelKey, ChannelState>)
    setLog([])
    setCostBreakdown(null)
    launchStartRef.at = new Date().toISOString()
    appendLog(`Launching campaign for ${activeProject.name}...`)

    try {
      const res = await fetch('/api/launch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          channels: Array.from(selectedChannels),
          goal: goal.trim() || undefined,
          angle: angle.trim() || undefined,
          campaignId: reuseCampaignId ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value)
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const ev of events) {
          const line = ev.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === 'channel_status') {
              setStates((s) => ({ ...s, [parsed.channel]: { status: parsed.status, ms: parsed.ms, error: parsed.error } }))
              if (parsed.status === 'ready') appendLog(`✓ ${parsed.channel} ready (${(parsed.ms / 1000).toFixed(1)}s)`)
              if (parsed.status === 'failed') appendLog(`✗ ${parsed.channel} failed: ${parsed.error}`)
            } else if (parsed.type === 'agent_status') {
              setAgents((a) => ({ ...a, [parsed.agent]: { status: parsed.status, output: parsed.output, label: parsed.label } }))
              if (parsed.status === 'working') appendLog(`◇ ${parsed.agent}: ${parsed.label ?? 'working…'}`)
              if (parsed.status === 'done') appendLog(`✓ ${parsed.agent} done`)
              if (parsed.status === 'failed') appendLog(`✗ ${parsed.agent} failed: ${parsed.error}`)
            } else if (parsed.type === 'done') {
              appendLog(`Campaign launch complete.`)
              toast.success('Campaign launched')
              await refreshAssets(activeProject.id)
              if (launchStartRef.at) {
                await refreshCost(activeProject.id, launchStartRef.at)
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Launch failed')
    } finally {
      setLaunching(false)
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  if (!activeProject) {
    return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>
  }

  const readyCount = Object.values(states).filter((s) => s.status === 'ready').length
  const failedCount = Object.values(states).filter((s) => s.status === 'failed').length

  return (
    <PageShell>
      {/* Hero */}
      <div className="mb-6 relative overflow-hidden rounded-md border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-slate-900 to-slate-900 p-6">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
          backgroundImage: 'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1.5 font-mono-data text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {hasBrandVoice ? 'SYSTEM_READY' : 'BRIEF_MISSING'}
              </span>
              {activeProject.website && (
                <span className="font-mono-data text-[10px] text-slate-500">· {activeProject.website.replace(/^https?:\/\//, '')}</span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Launch {activeProject.name}</h1>
            <p className="mt-1 text-sm text-slate-400 max-w-xl">
              One click generates a full campaign across 8 channels — ads, emails, social, blog, landing page — all grounded in your product&apos;s brand and ready to deploy.
            </p>
          </div>
          <button
            onClick={handleLaunch}
            disabled={launching || !hasBrandVoice}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-6 py-3 text-sm font-bold uppercase tracking-widest text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 transition-all"
          >
            {launching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
            {launching ? 'Launching…' : 'Launch Campaign'}
          </button>
        </div>
        {!hasBrandVoice && (
          <div className="relative mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
            No brand info synced yet. <a href="/projects" className="underline">Go to Projects → Sync Site</a> first so generated content references your real product.
          </div>
        )}
        {reuseCampaignId && (
          <div className="relative mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
            Re-launching into an existing campaign. New assets will attach to campaign{' '}
            <a href={`/campaigns/${reuseCampaignId}`} className="font-mono-data underline hover:text-emerald-100">
              {reuseCampaignId.slice(0, 8)}…
            </a>{' '}
            so this run extends the same command center view.
          </div>
        )}
      </div>

      {/* Plan Preview — shown BEFORE the operator commits AI budget. Lets
          them see what channels GrowthOS recommends, why, and tweak the
          goal/angle if they want to steer the launch away from defaults. */}
      {hasBrandVoice && (
        <PlanPreview
          plan={plan}
          loading={planLoading}
          error={planError}
          selected={selectedChannels}
          goal={goal}
          angle={angle}
          onToggleChannel={toggleChannel}
          onChangeGoal={setGoal}
          onChangeAngle={setAngle}
          onReload={() => activeProject && loadPlan(activeProject.id)}
        />
      )}

      {/* Agent Team Bar */}
      {(agents.cmo.status !== 'pending' || launching) && (
        <div className="mb-4 grid grid-cols-4 gap-3">
          {(['cmo', 'seo', 'director', 'analytics'] as const).map((a) => {
            const st = agents[a]
            const meta: Record<string, { label: string; role: string }> = {
              cmo: { label: 'CMO', role: 'Strategy' },
              seo: { label: 'SEO Lead', role: 'Keywords & Cluster' },
              director: { label: 'Director', role: 'Review & QA' },
              analytics: { label: 'Analytics', role: 'Experiments & UTM' },
            }
            return (
              <div key={a} className={cn(
                'rounded-md border p-3 transition-all',
                st.status === 'done' ? 'border-emerald-500/40 bg-emerald-500/5' :
                st.status === 'working' ? 'border-amber-500/40 bg-amber-500/5 animate-pulse' :
                st.status === 'failed' ? 'border-rose-500/40 bg-rose-500/5' :
                'border-slate-800 bg-slate-900/40'
              )}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 text-[9px] font-bold">{meta[a].label[0]}</div>
                    <span className="text-xs font-semibold text-slate-100">{meta[a].label}</span>
                  </div>
                  <StatusIndicator state={{ status: st.status === 'working' ? 'generating' : st.status === 'done' ? 'ready' : st.status === 'failed' ? 'failed' : 'pending' }} hasAssets={false} />
                </div>
                <p className="font-mono-data text-[9px] uppercase tracking-wider text-slate-500">{meta[a].role}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Strategic Brief */}
      {agents.cmo.output && (
        <SectionPanel
          className="mb-4 border-emerald-500/30"
          title={<span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-emerald-400" />CMO · Strategic Brief</span>}
        >
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Core Narrative</span>
              <p className="mt-1 text-slate-100 font-medium">{agents.cmo.output.core_narrative as string}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Audience Insight</span>
              <p className="mt-1 text-slate-300">{agents.cmo.output.audience_insight as string}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Key Metric</span>
                <p className="mt-1 font-mono-data text-emerald-300">{agents.cmo.output.key_metric as string}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Budget Split</span>
                <p className="mt-1 font-mono-data text-slate-300">{agents.cmo.output.budget_split_recommendation as string}</p>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">30-Day Themes</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(agents.cmo.output.top_3_themes as string[] | undefined)?.map((t, i) => <StatusPill key={i} tone="accent">{t}</StatusPill>)}
              </div>
            </div>
            {(agents.cmo.output.risks as string[] | undefined)?.length ? (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Risks</span>
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs text-amber-300">
                  {(agents.cmo.output.risks as string[]).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </SectionPanel>
      )}

      {/* SEO Plan */}
      {agents.seo.output && (
        <SectionPanel
          className="mb-4"
          title={<span className="flex items-center gap-2"><Search className="h-3.5 w-3.5 text-emerald-400" />SEO · Keyword Plan</span>}
        >
          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pillar</span>
              <p className="mt-1 text-slate-100 font-semibold">{agents.seo.output.cluster_pillar as string}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Top Keywords</span>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="px-2 py-1.5 text-left">Keyword</th>
                      <th className="px-2 py-1.5 text-left">Intent</th>
                      <th className="px-2 py-1.5 text-center">Volume</th>
                      <th className="px-2 py-1.5 text-center">Difficulty</th>
                      <th className="px-2 py-1.5 text-center">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {(agents.seo.output.primary_keywords as Array<{ keyword: string; intent: string; est_volume: string; est_difficulty: string; priority: number }>).map((k, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 font-mono-data text-slate-200">{k.keyword}</td>
                        <td className="px-2 py-1.5"><StatusPill tone="neutral">{k.intent}</StatusPill></td>
                        <td className="px-2 py-1.5 text-center"><StatusPill tone={k.est_volume === 'high' ? 'success' : k.est_volume === 'medium' ? 'warn' : 'neutral'}>{k.est_volume}</StatusPill></td>
                        <td className="px-2 py-1.5 text-center"><StatusPill tone={k.est_difficulty === 'easy' ? 'success' : k.est_difficulty === 'moderate' ? 'warn' : 'error'}>{k.est_difficulty}</StatusPill></td>
                        <td className="px-2 py-1.5 text-center font-mono-data text-emerald-300">{k.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Comparison Targets</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(agents.seo.output.comparison_targets as string[] | undefined)?.map((t, i) => <StatusPill key={i} tone="info">vs {t}</StatusPill>)}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Quick Wins</span>
                <ul className="mt-1 text-slate-300 text-[11px]">
                  {(agents.seo.output.quick_wins as string[] | undefined)?.slice(0, 3).map((q, i) => <li key={i}>· {q}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </SectionPanel>
      )}

      {/* Status summary */}
      {(readyCount > 0 || launching) && (
        <div className="mb-4 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /><span className="font-mono-data text-emerald-300">{readyCount} ready</span></span>
          {failedCount > 0 && <span className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-rose-400" /><span className="font-mono-data text-rose-300">{failedCount} failed</span></span>}
          {launching && <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /><span className="font-mono-data text-slate-400">in progress</span></span>}
          {costBreakdown && (
            <span className="flex items-center gap-1.5">
              <span className="font-mono-data text-slate-500">Spent</span>
              <span className="font-mono-data text-slate-200">${costBreakdown.total.toFixed(4)}</span>
            </span>
          )}
        </div>
      )}

      {/* Run cost breakdown — appears after the launch finishes. Shows
          which agent / channel cost what, and which model fired (so the
          operator can see Claude vs Gemini fallback transparency). */}
      {costBreakdown && costBreakdown.rows.length > 0 && (
        <div className="mb-6 rounded-md border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">This run cost <span className="font-mono-data text-emerald-300">${costBreakdown.total.toFixed(4)}</span></h2>
            <span className="font-mono-data text-[10px] text-slate-500">{costBreakdown.rows.reduce((s, r) => s + r.calls, 0)} model calls</span>
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="border-b border-slate-800 py-1 pr-3 font-mono-data">module</th>
                <th className="border-b border-slate-800 py-1 pr-3 font-mono-data">model</th>
                <th className="border-b border-slate-800 py-1 pr-3 font-mono-data text-right">calls</th>
                <th className="border-b border-slate-800 py-1 font-mono-data text-right">cost</th>
              </tr>
            </thead>
            <tbody>
              {costBreakdown.rows.map((r) => (
                <tr key={`${r.module}-${r.model ?? ''}`}>
                  <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-slate-200">{r.module}</td>
                  <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-slate-400">{r.model ?? '—'}</td>
                  <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-slate-400 text-right">{r.calls}</td>
                  <td className="border-b border-slate-900 py-1 font-mono-data text-emerald-300 text-right">${r.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Channel grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {CHANNELS.map((c) => {
          const state = states[c.key]
          const channelAssets = assets[c.key] ?? []
          const hasAssets = channelAssets.length > 0
          const Icon = c.icon
          return (
            <button
              key={c.key}
              onClick={() => hasAssets && setDrawer(c.key)}
              disabled={!hasAssets}
              className={cn(
                'group relative flex flex-col gap-3 rounded-md border p-4 text-left transition-all',
                state.status === 'ready' || hasAssets
                  ? 'border-emerald-500/30 bg-slate-900/60 hover:border-emerald-500/50 hover:bg-slate-900/80 cursor-pointer'
                  : state.status === 'failed'
                    ? 'border-rose-500/30 bg-rose-500/5 cursor-default'
                    : state.status === 'generating'
                      ? 'border-amber-500/30 bg-amber-500/5 animate-pulse cursor-default'
                      : 'border-slate-800 bg-slate-900/40 cursor-default'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-md bg-slate-800', c.accent)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{c.label}</h3>
                    <p className="font-mono-data text-[10px] text-slate-500 uppercase tracking-wider">{c.platform}</p>
                  </div>
                </div>
                <StatusIndicator state={state} hasAssets={hasAssets} />
              </div>

              <p className="text-xs text-slate-400">{c.output_description}</p>

              {(state.status === 'ready' || hasAssets) && (
                <div className="mt-auto flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider">
                  <span className="text-emerald-400">{channelAssets.length} asset{channelAssets.length === 1 ? '' : 's'}</span>
                  <span className="text-slate-500 group-hover:text-emerald-300">Open →</span>
                </div>
              )}
              {state.status === 'failed' && (
                <p className="mt-auto text-[10px] text-rose-400 truncate">{state.error}</p>
              )}
            </button>
          )
        })}
      </div>

      {/* Director Review */}
      {agents.director.output && (
        <SectionPanel
          className="mb-4 border-emerald-500/30"
          title={<span className="flex items-center gap-2">
            Director · Campaign Review
            <StatusPill tone={String(agents.director.output.overall_grade) === 'A' ? 'success' : String(agents.director.output.overall_grade) === 'D' ? 'error' : 'warn'}>
              GRADE: {agents.director.output.overall_grade as string}
            </StatusPill>
          </span>}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Strongest Asset</span>
                <p className="mt-1 text-slate-200">{agents.director.output.strongest_asset as string}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Weakest Asset</span>
                <p className="mt-1 text-slate-300">{agents.director.output.weakest_asset as string}</p>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Narrative Consistency</span>
              <p className="mt-1 text-slate-300">{agents.director.output.narrative_consistency as string}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Your Next 48 Hours</span>
              <ol className="mt-1 list-decimal list-inside space-y-1 text-slate-200">
                {(agents.director.output.next_3_actions as string[] | undefined)?.map((a, i) => <li key={i}>{a}</li>)}
              </ol>
            </div>
            {(agents.director.output.risk_flags as string[] | undefined)?.length ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">Risk Flags</span>
                <ul className="mt-1 list-disc list-inside text-xs text-rose-200">
                  {(agents.director.output.risk_flags as string[]).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ) : null}
            {(agents.director.output.gaps as string[] | undefined)?.length ? (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Gaps</span>
                <ul className="mt-1 list-disc list-inside text-xs text-slate-400">
                  {(agents.director.output.gaps as string[]).map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </SectionPanel>
      )}

      {/* Analytics Plan */}
      {agents.analytics.output && (
        <SectionPanel
          className="mb-4"
          title="Analytics · Experiments & Tracking"
        >
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">North Star</span>
              <p className="mt-1 font-mono-data text-emerald-300">{agents.analytics.output.north_star_metric as string}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Experiments to Run</span>
              <ul className="mt-1 space-y-2">
                {(agents.analytics.output.experiments as Array<{ hypothesis: string; test: string; success_criterion: string; duration_days: number }>).map((e, i) => (
                  <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                    <div className="text-xs font-semibold text-slate-100">{e.hypothesis}</div>
                    <div className="mt-1 text-[11px] text-slate-400">Test: {e.test}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] font-mono-data text-slate-500">
                      <span>Success: {e.success_criterion}</span>
                      <span>·</span>
                      <span>{e.duration_days}d</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionPanel>
      )}

      {/* Output log */}
      {log.length > 0 && (
        <SectionPanel title="Output Feed" contentClassName="p-0">
          <ul className="max-h-48 overflow-y-auto divide-y divide-slate-800">
            {log.map((l, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                <Clock className="h-3 w-3 text-slate-600 shrink-0" />
                <span className="font-mono-data text-[10px] text-slate-500 shrink-0 w-20">{l.time}</span>
                <span className="text-slate-300">{l.text}</span>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      {/* Drawer */}
      {drawer && (
        <ChannelDrawer
          channel={CHANNELS.find((c) => c.key === drawer)!}
          assets={assets[drawer] ?? []}
          onClose={() => setDrawer(null)}
          onCopy={copyText}
        />
      )}
    </PageShell>
  )
}

function PlanPreview({
  plan, loading, error, selected, goal, angle,
  onToggleChannel, onChangeGoal, onChangeAngle, onReload,
}: {
  plan: LaunchPlan | null
  loading: boolean
  error: string | null
  selected: Set<ChannelKey>
  goal: string
  angle: string
  onToggleChannel: (c: ChannelKey) => void
  onChangeGoal: (s: string) => void
  onChangeAngle: (s: string) => void
  onReload: () => void
}) {
  if (loading && !plan) {
    return (
      <div className="mb-4 rounded-md border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
        <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin text-emerald-400" />
        Building recommended launch plan…
      </div>
    )
  }
  if (error) {
    return (
      <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/5 p-4 text-xs text-rose-300">
        Plan unavailable: {error}{' '}
        <button onClick={onReload} className="underline hover:text-rose-200">Retry</button>
      </div>
    )
  }
  if (!plan) return null

  const goalOptions = ['awareness', 'engagement', 'conversion']

  return (
    <div className="mb-6 rounded-md border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-3.5 w-3.5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">Recommended Launch Plan</h2>
            <StatusPill tone={plan.source === 'classification' ? 'success' : 'warn'}>
              {plan.source === 'classification' ? plan.vertical.replace(/_/g, ' ') : 'unclassified · fallback playbook'}
            </StatusPill>
          </div>
          {plan.icp && <p className="mt-1 text-xs text-slate-400">ICP: {plan.icp}</p>}
        </div>
        <button
          onClick={onReload}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
          title="Reload plan"
        >
          <RefreshCw className="h-3 w-3" /> Reload
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
          <span className="font-mono-data text-[10px] uppercase tracking-wider text-slate-500">Primary KPI</span>
          <p className="mt-1 text-xs font-semibold text-emerald-300">{plan.primaryKpi}</p>
          {plan.secondaryKpis.length > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">Also watching: {plan.secondaryKpis.slice(0, 3).join(' · ')}</p>
          )}
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
          <span className="font-mono-data text-[10px] uppercase tracking-wider text-slate-500">Content Mix</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plan.contentMix.map((m) => (
              <span key={m.label} className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200">{m.label} <span className="text-emerald-300">{m.pct}%</span></span>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono-data text-[10px] uppercase tracking-wider text-slate-500">Channels</span>
          <span className="text-[10px] text-slate-500">{selected.size} of {plan.channels.length} on</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {plan.channels.map((c) => {
            const isOn = selected.has(c.channel)
            const tierTone = c.tier === 'primary' ? 'success' : c.tier === 'secondary' ? 'warn' : 'neutral'
            return (
              <button
                key={c.channel}
                onClick={() => onToggleChannel(c.channel)}
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 text-left transition-all',
                  isOn
                    ? 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2',
                  isOn ? 'border-emerald-400 bg-emerald-500/30' : 'border-slate-600',
                )}>
                  {isOn && <CheckCircle2 className="h-3 w-3 text-emerald-300" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-100 capitalize">{c.channel}</span>
                    <StatusPill tone={tierTone}>{c.tier}</StatusPill>
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-400">{c.reason}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="font-mono-data flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <Target className="h-3 w-3" /> Campaign goal
          </span>
          <select
            value={goal}
            onChange={(e) => onChangeGoal(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500/60 focus:outline-none"
          >
            {goalOptions.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono-data flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <Sparkles className="h-3 w-3" /> Narrative angle
          </span>
          <input
            type="text"
            value={angle}
            onChange={(e) => onChangeAngle(e.target.value)}
            placeholder={plan.defaultAngle ?? 'Optional — leave blank to let CMO pick'}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
          />
        </label>
      </div>

      {plan.suggestedAngles.length > 0 && (
        <div className="mb-4">
          <span className="font-mono-data text-[10px] uppercase tracking-wider text-slate-500">Suggested angles</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {plan.suggestedAngles.map((a) => (
              <button
                key={a}
                onClick={() => onChangeAngle(a)}
                className="rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300 hover:border-emerald-500/60 hover:text-emerald-200"
              >
                {a.length > 64 ? `${a.slice(0, 64)}…` : a}
              </button>
            ))}
          </div>
        </div>
      )}

      {plan.readiness.length > 0 && (
        <div>
          <span className="font-mono-data text-[10px] uppercase tracking-wider text-slate-500">Readiness</span>
          <ul className="mt-1.5 space-y-1 text-[11px]">
            {plan.readiness.map((r) => (
              <li key={r.label} className="flex items-start gap-2">
                {r.ready
                  ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                  : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                }
                <span className={r.ready ? 'text-slate-300' : 'text-amber-200'}>
                  <span className="font-semibold">{r.label}</span>{!r.ready ? <> — <span className="text-slate-400">{r.hint}</span></> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatusIndicator({ state, hasAssets }: { state: ChannelState; hasAssets: boolean }) {
  if (state.status === 'generating') return <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
  if (state.status === 'ready' || hasAssets) return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  if (state.status === 'failed') return <AlertCircle className="h-4 w-4 text-rose-400" />
  return <span className="h-4 w-4 rounded-full border border-slate-700" />
}

function ChannelDrawer({
  channel, assets, onClose, onCopy,
}: { channel: Channel; assets: Asset[]; onClose: () => void; onCopy: (text: string) => void }) {
  const [tab, setTab] = useState(0)
  const asset = assets[tab]
  const Icon = channel.icon

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col border-l border-slate-800 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-md bg-slate-800', channel.accent)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">{channel.label}</h2>
              <p className="font-mono-data text-[10px] uppercase tracking-wider text-slate-500">{channel.platform}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        {assets.length > 1 && (
          <div className="flex overflow-x-auto border-b border-slate-800 px-2">
            {assets.map((a, i) => (
              <button
                key={i}
                onClick={() => setTab(i)}
                className={cn(
                  'shrink-0 border-b-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider',
                  tab === i ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-500 hover:text-slate-300'
                )}
              >
                {a.title.slice(0, 30) || `Asset ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {asset ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-100">{asset.title}</h3>
              <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
                {channel.key === 'email' ? (
                  <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: asset.body }} />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono-data text-xs text-slate-300">{asset.body}</pre>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onCopy(`${asset.title}\n\n${asset.body}`)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                {asset.url && (
                  <a
                    href={asset.url}
                    target={asset.url.startsWith('/') ? undefined : '_blank'}
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </a>
                )}
              </div>

              {/* Deploy instructions */}
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Deploy Steps</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-xs text-slate-300">
                  <DeployInstructions channel={channel.key} />
                </ol>
                {channel.deploy_url && (
                  <a
                    href={channel.deploy_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
                  >
                    {channel.deploy_label} →
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-12">No assets yet. Launch a campaign to generate.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function DeployInstructions({ channel }: { channel: ChannelKey }) {
  const instructions: Record<ChannelKey, string[]> = {
    meta: [
      'Copy the ad copy above',
      'Open Meta Ads Manager → Create Campaign → objective "Conversions"',
      'Upload the 3 image aspects to their matching placements (feed / story / landscape)',
      'Paste headline + primary text + description',
      'Set budget ($20-50/day to start) and your audience targeting',
      'Launch and watch CPM — if under $15 you have signal',
    ],
    linkedin: [
      'For sponsored ad: LinkedIn Campaign Manager → Create Campaign → Sponsored Content',
      'For organic posts: paste directly into LinkedIn composer, post one per day',
      'Target job titles + companies relevant to your audience',
      'LinkedIn CPMs are higher ($25-80) but lead quality is better',
    ],
    tiktok: [
      'Script tells you hook + beats + caption — record on your phone, natural creator energy',
      'Use the thumbnail prompt to generate a cover image in a separate tool',
      'Post organically first to test — if it gets >1K views, boost as TikTok Spark ad',
    ],
    twitter: [
      'Copy the thread — post tweet 1 first',
      'Reply to tweet 1 with tweet 2, reply to tweet 2 with tweet 3, etc.',
      'Standalone tweets: space out 4-6 hours apart, different times of day',
      'Best: post hook at 9am ET, thread around 1pm, standalone around 7pm',
    ],
    reddit: [
      'Read each subreddit\'s rules before posting (check sidebar)',
      'Post ONE subreddit at a time — space 2-3 days apart',
      'Respond to every comment in the first 2 hours for algorithmic lift',
      'If mods remove for "self-promo," rewrite as a pure question/story',
    ],
    email: [
      'Templates saved in Email module — preview each before enabling',
      'Sequence is set to trigger on signup (delay 0h / 24h / 72h)',
      'Edit the CTA URL to point to your actual app / signup',
      'Enable the sequence from the Email page when ready',
    ],
    blog: [
      'Post saved in Content Workshop with target keywords',
      'Review SEO checklist inside the editor',
      'Export as Markdown or paste directly into Ghost / Webflow / WordPress',
      'Internal-link to your landing page + CTA',
    ],
    landing: [
      'Page is already live at /p/[slug] — URL shown above',
      'Share this URL in ads, emails, and social posts',
      'Analytics page tracks visits and form submissions automatically',
      'Customize further at Leads → Landing Pages',
    ],
  }
  return (
    <>
      {instructions[channel].map((step, i) => (
        <li key={i} className="text-slate-300">{step}</li>
      ))}
    </>
  )
}
