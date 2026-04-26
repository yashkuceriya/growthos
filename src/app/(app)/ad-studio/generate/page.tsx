'use client'

import { useState, useEffect } from 'react'
import { useProject } from '@/hooks/use-project'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Mail, Music, Search, Zap, Loader2, Plus, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CreativeModePicker } from '@/components/ai/CreativeModePicker'
import { VideoModelPicker } from '@/components/ai/VideoModelPicker'

const PLATFORMS = [
  { key: 'meta', label: 'Meta', icon: Mail },
  { key: 'tiktok', label: 'TikTok', icon: Music },
  { key: 'google', label: 'Google', icon: Search },
] as const

const GOALS = ['Lead Generation', 'Conversion', 'Awareness', 'Engagement']
const TONES = ['Authority/Expert', 'Casual', 'Urgent', 'Contrarian', 'Friendly']

type PipelineStep = { key: string; label: string; status: 'pending' | 'active' | 'complete'; lines: string[] }

export default function GenerateAdsPage() {
  const { activeProject } = useProject()
  const router = useRouter()

  const [platform, setPlatform] = useState<'meta' | 'tiktok' | 'google'>('meta')
  const [audience, setAudience] = useState('')
  const [offer, setOffer] = useState('')
  const [goal, setGoal] = useState('Lead Generation')
  const [tone, setTone] = useState('Authority/Expert')
  const [creativeMode, setCreativeMode] = useState<string | null>(null)
  const [generateVideo, setGenerateVideo] = useState(false)
  const [videoModel, setVideoModel] = useState('kling-2')
  const [generating, setGenerating] = useState(false)
  const [videoRenderId, setVideoRenderId] = useState<string | null>(null)
  const [videoStatus, setVideoStatus] = useState<'idle' | 'queued' | 'rendering' | 'completed' | 'failed'>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)

  // Auto-fill offer + audience from synced brand_voice when project changes
  useEffect(() => {
    if (!activeProject) return
    const bv = (activeProject as unknown as { brand_voice?: Record<string, unknown> }).brand_voice
    if (bv && typeof bv === 'object') {
      if (!offer && typeof bv.value_proposition === 'string') setOffer(bv.value_proposition)
      if (!audience && typeof bv.target_audience === 'string') setAudience(bv.target_audience)
      if (typeof bv.tone_of_voice === 'string' && TONES.includes(bv.tone_of_voice)) setTone(bv.tone_of_voice)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  const [pipeline, setPipeline] = useState<PipelineStep[]>([
    { key: 'generate', label: '1. Generate Content', status: 'pending', lines: [] },
    { key: 'evaluate', label: '2. Evaluate & Score', status: 'pending', lines: [] },
    { key: 'refine', label: '3. Refine Iterations', status: 'pending', lines: [] },
  ])

  const [scores, setScores] = useState<{ clarity?: number; impact?: number; seo?: number; trust?: number }>({})

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return

    setGenerating(true)
    setPipeline((prev) => prev.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending', lines: [] })))
    setScores({})

    // Kick off video render in parallel with the ad pipeline. They don't
    // depend on each other so we save ~30-60s on the demo path.
    if (generateVideo) {
      setVideoStatus('queued')
      setVideoUrl(null)
      setVideoError(null)
      setVideoRenderId(null)
      fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          topic: offer || `${platform} ad for ${audience}`,
          mode: creativeMode,
          modelId: videoModel,
          durationSeconds: 10,
        }),
      })
        .then(async (r) => {
          const j = await r.json()
          if (!r.ok) {
            setVideoStatus('failed')
            setVideoError(j.error ?? 'Video render failed')
            return
          }
          setVideoRenderId(j.renderId)
          setVideoStatus(j.status === 'completed' ? 'completed' : (j.status as typeof videoStatus))
          if (j.videoUrl) setVideoUrl(j.videoUrl)
          if (j.error) setVideoError(j.error)
        })
        .catch((e) => {
          setVideoStatus('failed')
          setVideoError(e instanceof Error ? e.message : 'Video render failed')
        })
    } else {
      setVideoStatus('idle')
      setVideoRenderId(null)
      setVideoUrl(null)
      setVideoError(null)
    }

    try {
      const response = await fetch('/api/ai/generate-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          platform,
          audienceSegment: audience,
          productOffer: offer,
          campaignGoal: goal,
          tone,
          creativeMode,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error ?? 'Generation failed')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      let errorMessage: string | null = null
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value)
          const lines = text.split('\n').filter((l) => l.startsWith('data: '))
          for (const line of lines) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.progress) {
                appendLine(parsed.progress)
                if (parsed.progress.startsWith('Error:')) errorMessage = parsed.progress
              }
              if (parsed.scores) setScores(parsed.scores)
            } catch { /* ignore */ }
          }
        }
      }

      if (errorMessage) {
        toast.error(errorMessage, { duration: 10000 })
        // keep user on this page so they can see the full error in the live pipeline
        return
      }

      setPipeline((prev) => prev.map((s) => ({ ...s, status: 'complete' })))
      toast.success('Ad generation complete')
      // Don't redirect away if a video is still rendering — the user wants
      // to watch it land. The ad library is a click away in the sidebar.
      if (!generateVideo) {
        setTimeout(() => router.push('/ad-studio'), 600)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // Poll video status until terminal state. fal/openai take 30-90s, so 5s
  // cadence is fine — we won't burn rate-limit on either side.
  useEffect(() => {
    if (!videoRenderId) return
    if (videoStatus === 'completed' || videoStatus === 'failed' || videoStatus === 'idle') return
    let cancelled = false
    const tick = async () => {
      const res = await fetch(`/api/video/poll/${videoRenderId}`).catch(() => null)
      if (!res || cancelled) return
      const j = await res.json().catch(() => ({}))
      if (cancelled) return
      if (j.status === 'completed') {
        setVideoStatus('completed')
        if (j.videoUrl) setVideoUrl(j.videoUrl)
      } else if (j.status === 'failed') {
        setVideoStatus('failed')
        setVideoError(j.error ?? 'Video render failed')
      } else {
        setVideoStatus(j.status as typeof videoStatus)
      }
    }
    const interval = setInterval(tick, 5000)
    void tick()
    return () => { cancelled = true; clearInterval(interval) }
  }, [videoRenderId, videoStatus])

  function appendLine(msg: string) {
    setPipeline((prev) => {
      const next = [...prev]
      const activeIdx = next.findIndex((s) => s.status === 'active')
      if (activeIdx < 0) return prev
      next[activeIdx] = { ...next[activeIdx], lines: [...next[activeIdx].lines, msg] }
      // crude stage detection
      const m = msg.toLowerCase()
      if (m.includes('evaluat') && activeIdx === 0) {
        next[0] = { ...next[0], status: 'complete' }
        next[1] = { ...next[1], status: 'active' }
      } else if (m.includes('refin') && activeIdx === 1) {
        next[1] = { ...next[1], status: 'complete' }
        next[2] = { ...next[2], status: 'active' }
      }
      return next
    })
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        breadcrumb={<span>PROJECTS {'>'} CAMPAIGN_ALPHA_GEN</span>}
        title="Ad Generate"
        subtitle={<StatusPill tone="accent"><Zap className="h-2.5 w-2.5" />AI ENGINE V4.2</StatusPill>}
      />

      <div className="grid grid-cols-12 gap-4">
        {/* Config */}
        <SectionPanel
          className="col-span-5"
          title="Configuration"
          action={<span className="text-[10px] text-slate-500">Define parameters for generative models.</span>}
        >
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Platform</div>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPlatform(key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                      platform === key
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Target Audience</div>
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                required
                placeholder="e.g. CMOs at B2B Tech Startups"
                className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Core Offer</div>
              <textarea
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                required
                rows={4}
                placeholder="Describe the value proposition..."
                className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Goal</div>
                <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none">
                  {GOALS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Tone</div>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none">
                  {TONES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <CreativeModePicker value={creativeMode} onChange={setCreativeMode} />

            <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateVideo}
                  onChange={(e) => setGenerateVideo(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span className="text-xs font-semibold text-slate-200">Also generate a 10-sec video</span>
              </label>
              {generateVideo && <VideoModelPicker value={videoModel} onChange={setVideoModel} />}
            </div>

            <button
              type="submit"
              disabled={generating}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {generating ? 'Generating…' : 'Execute Generation'}
            </button>
          </form>
        </SectionPanel>

        {/* Live pipeline */}
        <SectionPanel
          className="col-span-7"
          title={<span className="flex items-center gap-2">📺 Live Pipeline</span>}
          action={<span className="font-mono-data text-[10px] text-slate-500">JOB_ID: #OS-9942</span>}
        >
          <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <span className="text-slate-500">SSE_STREAM_STATUS:</span>
            <span className={generating ? 'text-emerald-400' : 'text-slate-400'}>
              {generating ? 'ACTIVE' : 'IDLE'}
            </span>
          </div>

          <ul className="space-y-4">
            {pipeline.map((s) => (
              <li key={s.key} className="relative pl-6">
                <div className="absolute left-0 top-0.5">
                  {s.status === 'complete' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
                   s.status === 'active' ? <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" /> :
                   <Circle className="h-4 w-4 text-slate-600" />}
                </div>
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-semibold uppercase tracking-wider',
                    s.status === 'complete' ? 'text-emerald-300' :
                    s.status === 'active' ? 'text-slate-100' :
                    'text-slate-500'
                  )}>{s.label}</span>
                  <StatusPill tone={s.status === 'complete' ? 'success' : s.status === 'active' ? 'warn' : 'neutral'}>
                    {s.status === 'complete' ? 'COMPLETED' : s.status === 'active' ? 'PROCESSING…' : 'WAITING'}
                  </StatusPill>
                </div>
                {s.lines.length > 0 && (
                  <div className="mt-2 space-y-1 font-mono-data text-[11px] text-slate-400">
                    {s.lines.map((l, i) => (
                      <div key={i}>{'>'} {l}</div>
                    ))}
                  </div>
                )}
                {s.status !== 'pending' && (
                  <div className="mt-2 h-0.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div className={cn('h-full', s.status === 'complete' ? 'bg-emerald-400 w-full' : 'bg-emerald-400 w-2/3 animate-pulse')} />
                  </div>
                )}
              </li>
            ))}
          </ul>

          {(scores.clarity || scores.impact || scores.seo || scores.trust) && (
            <div className="mt-5 grid grid-cols-4 gap-2">
              {[
                { k: 'CLARITY', v: scores.clarity },
                { k: 'IMPACT', v: scores.impact },
                { k: 'SEO', v: scores.seo },
                { k: 'TRUST', v: scores.trust },
              ].map((x) => (
                <div key={x.k} className="rounded-md border border-slate-800 bg-slate-800/40 px-3 py-2">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{x.k}</div>
                  <div className="mt-1 font-mono-data text-lg font-semibold text-slate-100">{x.v ? x.v.toFixed(2) : '—'}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2">
            {['IMG_01', 'IMG_02', null].map((img, i) => (
              <div key={i} className="aspect-square rounded-md bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-slate-800 flex items-center justify-center">
                {img ? <span className="font-mono-data text-[10px] text-slate-500">{img}</span> : <Plus className="h-4 w-4 text-slate-700" />}
              </div>
            ))}
          </div>

          {videoStatus !== 'idle' && (
            <div className="mt-5 rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Video Render</span>
                <StatusPill tone={videoStatus === 'completed' ? 'success' : videoStatus === 'failed' ? 'error' : 'warn'}>
                  {videoStatus}
                </StatusPill>
              </div>
              {videoStatus === 'completed' && videoUrl && (
                <video src={videoUrl} controls className="w-full rounded border border-slate-800" />
              )}
              {videoStatus !== 'completed' && videoStatus !== 'failed' && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Rendering 10-sec clip — this typically takes 30–90s.</span>
                </div>
              )}
              {videoStatus === 'failed' && videoError && (
                <p className="text-xs text-rose-300 break-words">{videoError}</p>
              )}
            </div>
          )}
        </SectionPanel>
      </div>

      <div className="mt-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />SYSTEM_OPTIMIZED</span>
          <span>⚙ GPU_USAGE: 42%</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Lat: 124ms</span>
          <button className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-slate-300 hover:bg-slate-800">⋮⋮ API CONFIG</button>
        </div>
      </div>
    </PageShell>
  )
}
