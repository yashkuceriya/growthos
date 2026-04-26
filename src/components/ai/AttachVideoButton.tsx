'use client'

// Drop into any list of ad_copies / social_posts rows to add a "🎬 Add video"
// button. Handles its own dialog state, submits to /api/ai/generate-video
// with the right attachTo, and live-polls until the dispatcher attaches the
// video URL to the parent row. Parent should call onComplete to refresh.

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Film, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CreativeModePicker } from './CreativeModePicker'
import { VideoModelPicker } from './VideoModelPicker'
import { defaultModel } from '@/lib/video/models'
import { useVideoPolling } from '@/hooks/use-video-polling'

interface Props {
  attachTo: { type: 'ad_copy' | 'social_post'; id: string }
  projectId: string
  /** Topic / scene description default — usually the parent row's text. */
  topicDefault: string
  /** Existing video URL on the parent row, if any. */
  videoUrl?: string | null
  /** In-flight render id — when set we show the rendering state and poll. */
  renderId?: string | null
  videoStatus?: string | null
  /** Called when a render finishes (any terminal status). Parent should refetch. */
  onComplete?: () => void
  className?: string
  /** Optional ad image URL to use as the init frame for image-to-video. */
  referenceImageUrl?: string | null
}

export function AttachVideoButton({
  attachTo, projectId, topicDefault, videoUrl, renderId, videoStatus,
  onComplete, className, referenceImageUrl,
}: Props) {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState(topicDefault.slice(0, 400))
  const [mode, setMode] = useState<string | null>(null)
  const [modelId, setModelId] = useState(defaultModel().id)
  const [duration, setDuration] = useState(10)
  const [submitting, setSubmitting] = useState(false)

  const [localStatus, setLocalStatus] = useState<string | null>(videoStatus ?? null)
  const [localUrl, setLocalUrl] = useState<string | null>(videoUrl ?? null)

  // Poll if a render is in flight (either passed in or just created locally).
  const activeRenderId = renderId ?? null
  useVideoPolling(
    activeRenderId
      ? [{ id: activeRenderId, status: localStatus ?? 'rendering', video_url: localUrl }]
      : [],
    (id, result) => {
      setLocalStatus(result.status)
      if (result.videoUrl) setLocalUrl(result.videoUrl)
      if (result.status === 'completed' || result.status === 'failed') onComplete?.()
    },
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          topic,
          mode,
          modelId,
          durationSeconds: duration,
          attachTo,
          // Image-to-video chain: when the parent ad already has a generated
          // image, pass it as the init frame so the video reflects the same
          // visual identity. Models that don't support image_init ignore it.
          referenceImageUrl: referenceImageUrl ?? undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) toast.error(j.error ?? 'Video render failed to start')
      else {
        toast.success('Video render queued')
        setLocalStatus(j.status)
        if (j.videoUrl) setLocalUrl(j.videoUrl)
        setOpen(false)
        onComplete?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed')
    }
    setSubmitting(false)
  }

  // Already has a video — show preview link instead of the trigger.
  const url = localUrl ?? videoUrl ?? null
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Open generated video"
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20',
          className,
        )}
      >
        <Film className="h-3 w-3" /> Video <ExternalLink className="h-2.5 w-2.5" />
      </a>
    )
  }

  // Render in flight — show status pill instead of the trigger.
  const status = localStatus ?? videoStatus ?? null
  if (status && (status === 'queued' || status === 'rendering')) {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300', className)}>
        <Loader2 className="h-3 w-3 animate-spin" /> {status}
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Last render failed — retry"
        className={cn('inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 hover:bg-amber-500/20', className)}
      >
        <AlertTriangle className="h-3 w-3" /> Retry video
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <div className={cn('inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800 cursor-pointer', className)}>
          <Film className="h-3 w-3" /> Add video
        </div>
      </DialogTrigger>
      <DialogContent className="border-slate-700 bg-slate-900 max-w-xl">
        <DialogHeader><DialogTitle className="text-slate-100">Generate a video</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Visual prompt / topic</div>
            <textarea required rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none resize-none" />
            <p className="mt-1 text-[10px] text-slate-500">Concrete scene description works best.</p>
          </div>
          <CreativeModePicker value={mode} onChange={setMode} />
          <VideoModelPicker value={modelId} onChange={setModelId} />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Duration (sec)</div>
            <input type="number" min={3} max={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
          </div>
          <button type="submit" disabled={submitting || !topic} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Generate'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
