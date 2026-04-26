'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Film, Loader2, Trash2, AlertTriangle, ExternalLink } from 'lucide-react'
import { CreativeModePicker } from '@/components/ai/CreativeModePicker'
import { VideoModelPicker } from '@/components/ai/VideoModelPicker'
import { useVideoPolling } from '@/hooks/use-video-polling'
import { defaultModel } from '@/lib/video/models'

interface RenderRow {
  id: string
  project_id: string | null
  model: string
  provider: string
  prompt: string
  duration_seconds: number
  status: string
  video_url: string | null
  thumbnail_url: string | null
  error: string | null
  attached_to_type: string | null
  attached_to_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  completed_at: string | null
}

export default function VideoPage() {
  const { activeProject } = useProject()
  const [renders, setRenders] = useState<RenderRow[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<string | null>(null)
  const [modelId, setModelId] = useState(defaultModel().id)
  const [duration, setDuration] = useState(10)
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '1:1'>('9:16')
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    const res = await fetch(`/api/video/renders?project_id=${activeProject.id}&limit=100`)
    const j = await res.json().catch(() => ({}))
    setRenders((j.renders as RenderRow[]) ?? [])
    setLoading(false)
  }, [activeProject])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  // Live-poll any rendering rows
  useVideoPolling(
    renders,
    (id, result) => {
      setRenders((prev) =>
        prev.map((r) => (r.id === id
          ? { ...r, status: result.status, video_url: result.videoUrl ?? r.video_url, error: result.error ?? r.error }
          : r),
        ),
      )
    },
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          topic,
          mode,
          modelId,
          durationSeconds: duration,
          aspectRatio: aspect,
        }),
      })
      const j = await res.json()
      if (!res.ok) toast.error(j.error ?? 'Submit failed')
      else {
        toast.success('Video render queued')
        setOpen(false); setTopic('')
        await refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed')
    }
    setSubmitting(false)
  }

  async function deleteRender(id: string) {
    if (!confirm('Delete this render?')) return
    const res = await fetch(`/api/video/renders/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); await refresh() } else toast.error('Delete failed')
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Video Studio"
        subtitle="Generate 10-sec creative across Kling, Veo, Sora, Grok, Runway, Hailuo"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                <Plus className="h-3.5 w-3.5" /> New Render
              </div>
            </DialogTrigger>
            <DialogContent className="border-slate-700 bg-slate-900 max-w-xl">
              <DialogHeader><DialogTitle className="text-slate-100">Generate a video</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Topic / Prompt</div>
                  <textarea required rows={3} placeholder="A founder unboxing the product, golden hour, handheld" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                  <p className="mt-1 text-[10px] text-slate-500">Concrete scene description works better than marketing copy.</p>
                </div>

                <CreativeModePicker value={mode} onChange={setMode} />

                <VideoModelPicker value={modelId} onChange={setModelId} />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Duration (sec)</div>
                    <input type="number" min={3} max={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Aspect</div>
                    <select value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                      <option value="9:16">9:16 (vertical)</option>
                      <option value="16:9">16:9 (horizontal)</option>
                      <option value="1:1">1:1 (square)</option>
                    </select>
                  </div>
                </div>

                <button type="submit" disabled={submitting || !topic} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                  {submitting ? 'Submitting…' : 'Generate'}
                </button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <SectionPanel><p className="text-sm text-slate-500">Loading…</p></SectionPanel>
      ) : renders.length === 0 ? (
        <SectionPanel>
          <div className="flex flex-col items-center py-12">
            <Film className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No renders yet. Generate your first 10-sec video.</p>
          </div>
        </SectionPanel>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {renders.map((r) => {
            const isActive = r.status === 'queued' || r.status === 'rendering'
            const tone = r.status === 'completed' ? 'success' : r.status === 'failed' ? 'error' : 'warn'
            return (
              <div key={r.id} className="rounded-md border border-slate-800 bg-slate-900/60 overflow-hidden">
                <div className="relative aspect-video bg-slate-950">
                  {r.status === 'completed' && r.video_url ? (
                    <video src={r.video_url} controls className="absolute inset-0 h-full w-full object-cover" />
                  ) : isActive ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-[10px] font-mono-data uppercase tracking-wider">{r.status}</span>
                    </div>
                  ) : r.status === 'failed' ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-amber-300 text-center">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="text-[10px] break-words">{r.error ?? 'Render failed'}</span>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                      <Film className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-slate-100 truncate">{r.model}</span>
                    <StatusPill tone={tone}>{r.status}</StatusPill>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{r.prompt}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-mono-data text-slate-500">
                    <span>{format(new Date(r.created_at), 'MMM d HH:mm')} · {r.duration_seconds}s</span>
                    <div className="flex items-center gap-1.5">
                      {r.video_url && (
                        <a href={r.video_url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button onClick={() => deleteRender(r.id)} className="text-slate-500 hover:text-rose-400">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
