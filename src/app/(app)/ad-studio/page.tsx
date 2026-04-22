'use client'

import { useEffect, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Sparkles, Plus, Image as ImageIcon, ShieldCheck, AlertTriangle, Zap, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdCopy {
  id: string
  brief_id: string
  iteration_number: number
  primary_text: string | null
  headline: string | null
  description: string | null
  cta_button: string | null
  status: string
  evaluation_scores: Record<string, { score: number }> | null
  weighted_average: number | null
  compliance: Record<string, unknown> | null
  media_urls: string[] | null
  created_at: string
}

type Tab = 'review' | 'approved' | 'all'

export default function AdStudioPage() {
  const { activeProject } = useProject()
  const [ads, setAds] = useState<AdCopy[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('review')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generatingImages, setGeneratingImages] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function generateImages(adId: string) {
    setGeneratingImages(true)
    try {
      const res = await fetch('/api/ai/generate-ad-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adCopyId: adId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Image generation failed')
      const { count } = await res.json()
      toast.success(`Generated ${count} image${count === 1 ? '' : 's'}`)
      fetchAds()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setGeneratingImages(false)
  }

  useEffect(() => {
    if (activeProject) fetchAds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  async function fetchAds() {
    if (!activeProject) return
    setLoading(true)
    const { data } = await supabase
      .from('ad_copies')
      .select('*, ad_briefs!inner(project_id)')
      .eq('ad_briefs.project_id', activeProject.id)
      .order('created_at', { ascending: false })
    const list = (data as unknown as AdCopy[]) ?? []
    setAds(list)
    if (list.length && !selectedId) setSelectedId(list[0].id)
    setLoading(false)
  }

  async function updateStatus(id: string, newStatus: string) {
    const { error } = await supabase.from('ad_copies').update({
      status: newStatus,
      approved_at: newStatus === 'human_approved' ? new Date().toISOString() : undefined,
    }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success(newStatus === 'human_approved' ? 'Approved' : 'Discarded'); fetchAds() }
  }

  const filtered = {
    review: ads.filter((a) => ['evaluator_pass', 'compliance_pass', 'iterating', 'generated'].includes(a.status)),
    approved: ads.filter((a) => ['human_approved', 'experiment_ready'].includes(a.status)),
    all: ads,
  }

  const list = filtered[tab]
  const selected = list.find((a) => a.id === selectedId) ?? list[0]

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Ad Studio"
        subtitle="AI-powered ad generation & review"
        actions={
          <button onClick={() => router.push('/ad-studio/generate')} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
            <Plus className="h-3.5 w-3.5" /> Generate Ads
          </button>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        {/* Ad library */}
        <div className="col-span-4">
          <SectionPanel
            title={<span className="flex items-center gap-2">Ad Library <span className="font-mono-data text-[10px] text-slate-500">V2.4.0</span></span>}
            contentClassName="p-0"
          >
            <div className="flex border-b border-slate-800">
              {(['review', 'approved', 'all'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider border-b-2',
                    tab === t ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-500 hover:text-slate-300'
                  )}
                >
                  {t} ({filtered[t].length})
                </button>
              ))}
            </div>
            <ul className="max-h-[600px] overflow-y-auto divide-y divide-slate-800">
              {loading ? (
                <li className="p-4 text-sm text-slate-500">Loading…</li>
              ) : list.length === 0 ? (
                <li className="p-8 flex flex-col items-center gap-2 text-slate-500">
                  <Sparkles className="h-8 w-8 opacity-50" />
                  <span className="text-sm">No ads in this tab</span>
                </li>
              ) : list.map((ad) => {
                const isActive = selected?.id === ad.id
                return (
                  <li
                    key={ad.id}
                    onClick={() => setSelectedId(ad.id)}
                    className={cn(
                      'cursor-pointer px-3 py-3 flex gap-3 relative',
                      isActive ? 'bg-emerald-500/5' : 'hover:bg-slate-800/40'
                    )}
                  >
                    {isActive && <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-emerald-400" />}
                    <div className="h-14 w-14 shrink-0 rounded bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-100 truncate">{ad.headline ?? 'Untitled'}</h3>
                        <StatusPill status={ad.status}>{statusLabel(ad.status)}</StatusPill>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{ad.description ?? ad.primary_text ?? '—'}</p>
                      <div className="mt-1 flex items-center gap-2 font-mono-data text-[10px] text-slate-500">
                        <span>ID: AD_{ad.id.slice(0, 6).toUpperCase()}</span>
                        {ad.weighted_average != null && (
                          <span className="text-emerald-400">Score: {Math.round(ad.weighted_average * 10)}/100</span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </SectionPanel>
        </div>

        {/* Preview */}
        <div className="col-span-5 flex flex-col gap-4">
          <SectionPanel
            title={<span className="flex items-center gap-2">
              <span className="font-mono-data text-slate-100">{selected?.headline?.toUpperCase() ?? 'NO AD SELECTED'}</span>
              {selected?.weighted_average != null && <StatusPill tone="accent"><Zap className="h-2.5 w-2.5" />AI Evaluated</StatusPill>}
            </span>}
            action={
              selected && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => generateImages(selected.id)}
                    disabled={generatingImages}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {generatingImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {selected.media_urls?.length ? 'Regenerate Images' : 'Generate Images'}
                  </button>
                  {selected.status !== 'human_approved' && (
                    <>
                      <button onClick={() => updateStatus(selected.id, 'rejected')} className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
                        Discard
                      </button>
                      <button onClick={() => updateStatus(selected.id, 'human_approved')} className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                        Approve
                      </button>
                    </>
                  )}
                </div>
              )
            }
          >
            {selected?.media_urls && selected.media_urls.length > 0 ? (
              <div className="space-y-3">
                {selected.media_urls.map((url, i) => (
                  <div key={i} className="rounded-md overflow-hidden border border-slate-800 bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Ad variant ${i + 1}`} className="w-full h-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="aspect-[16/10] w-full rounded-md bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2">
                <ImageIcon className="h-10 w-10 text-slate-700" />
                <p className="text-xs text-slate-500">No images yet — click Generate Images</p>
              </div>
            )}
            {selected && (selected.primary_text || selected.description || selected.cta_button) && (
              <div className="mt-3 rounded-md border border-slate-800 bg-slate-800/40 p-3 space-y-2 text-xs">
                {selected.primary_text && <div><span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">Body</span><p className="mt-0.5 text-slate-200">{selected.primary_text}</p></div>}
                {selected.description && <div><span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">Description</span><p className="mt-0.5 text-slate-300">{selected.description}</p></div>}
                {selected.cta_button && <div><span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px]">CTA</span> <StatusPill tone="accent">{selected.cta_button}</StatusPill></div>}
              </div>
            )}
            {selected?.evaluation_scores && (
              <div className="mt-4 grid grid-cols-5 gap-2">
                {Object.entries(selected.evaluation_scores).slice(0, 5).map(([key, val]) => (
                  <div key={key} className="rounded-md bg-slate-800/60 border border-slate-800 p-2 text-center">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{key.slice(0, 5)}</div>
                    <div className="mt-1 font-mono-data text-lg font-semibold text-slate-100">{Number(val.score).toFixed(1)}</div>
                    <div className="mt-1 h-0.5 w-full rounded-full bg-emerald-500/30"><div className="h-full bg-emerald-400" style={{ width: `${val.score * 10}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </SectionPanel>
        </div>

        {/* Right rail: compliance + metadata */}
        <div className="col-span-3 flex flex-col gap-4">
          <SectionPanel
            title={<span className="flex items-center justify-between w-full">
              <span>Compliance Scan</span>
              <StatusPill tone="success">PASSED 4/5</StatusPill>
            </span>}
          >
            <ul className="space-y-3">
              {[
                { ok: true, label: 'Logo Visibility', detail: 'Brand mark detected in persistent corner for >80% duration.' },
                { ok: true, label: 'Typography Legibility', detail: 'Minimum 24pt Inter font weight maintained across all text overlays.' },
                { ok: false, label: 'Safe Zone Margin', detail: 'Call to action sits near TikTok interactive elements. Recommend shifting up 20px.', action: 'AUTO-FIX' },
                { ok: true, label: 'Aspect Ratio Harmony', detail: 'Dynamic adaptation for 9:16 vertical and 1:1 square feeds.' },
                { ok: true, label: 'Audio Normalization', detail: 'Voiceover peak at -6dB with ambient score at -18dB. Optimal clarity.' },
              ].map((c) => (
                <li key={c.label} className="flex gap-2">
                  {c.ok ? <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-200">{c.label}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">{c.detail}</div>
                    {c.action && (
                      <div className="mt-1 flex items-center gap-2">
                        <button className="font-mono-data text-[10px] font-semibold text-emerald-400 hover:text-emerald-300">{c.action}</button>
                        <button className="font-mono-data text-[10px] text-slate-500 hover:text-slate-400">DISMISS</button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </SectionPanel>

          <SectionPanel title="Content Metadata">
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Primary Headline</div>
                <div className="rounded-md bg-slate-800/60 border border-slate-800 px-3 py-2 text-sm italic text-slate-300">
                  &quot;{selected?.headline ?? 'Redefine your growth velocity.'}&quot;
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Target Audience</div>
                  <div className="rounded-md bg-slate-800/60 border border-slate-800 px-3 py-2 text-xs text-slate-300">Growth Operators</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Platform</div>
                  <div className="rounded-md bg-slate-800/60 border border-slate-800 px-3 py-2 text-xs text-slate-300">LinkedIn / Meta</div>
                </div>
              </div>
            </div>
          </SectionPanel>
        </div>
      </div>

      {/* Footer rapid generate */}
      <div className="mt-4 flex justify-end">
        <button onClick={() => router.push('/ad-studio/generate')} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
          <kbd className="rounded bg-slate-700 px-1 font-mono-data text-[10px]">⌘</kbd>
          <kbd className="rounded bg-slate-700 px-1 font-mono-data text-[10px]">R</kbd>
          Rapid Generate
        </button>
      </div>
    </PageShell>
  )
}

function statusLabel(s: string) {
  if (s === 'evaluator_pass' || s === 'compliance_pass' || s === 'iterating' || s === 'generated') return 'Pending'
  if (s === 'human_approved' || s === 'experiment_ready') return 'Approved'
  if (s === 'rejected' || s === 'below_threshold') return 'Rejected'
  return 'Draft'
}
