// xAI Grok Imagine provider. The xAI API surface is in flux; this is the
// public pattern against /v1/videos/generations. If xAI changes the route,
// only this file needs updating — the dispatcher and UI are unchanged.

import type {
  VideoProvider,
  VideoSubmitResult,
  VideoPollResult,
} from '../types'
import { MissingProviderKeyError, UnsupportedModelError } from '../types'

const XAI_BASE = 'https://api.x.ai/v1'

function authHeaders(): HeadersInit {
  const key = process.env.XAI_API_KEY
  if (!key) throw new MissingProviderKeyError('XAI_API_KEY', 'xai')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

interface XAIVideoResponse {
  id: string
  status?: 'queued' | 'processing' | 'completed' | 'failed'
  video_url?: string
  thumbnail_url?: string
  error?: string
}

export const xaiProvider: VideoProvider = {
  id: 'xai',

  async submit(modelId, args): Promise<VideoSubmitResult> {
    if (modelId !== 'grok-imagine') throw new UnsupportedModelError(modelId, 'xai')

    const res = await fetch(`${XAI_BASE}/videos/generations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: 'grok-imagine',
        prompt: args.prompt,
        duration: Math.min(args.durationSeconds, 6),
        aspect_ratio: args.aspectRatio ?? '16:9',
      }),
    })
    const json = (await res.json().catch(() => ({}))) as XAIVideoResponse
    if (!res.ok || !json.id) {
      throw new Error(`xai submit: ${json.error ?? `HTTP ${res.status}`}`)
    }
    // Some xAI endpoints return the URL inline on small/short clips; if so we
    // surface it so the dispatcher can skip the polling state entirely.
    return {
      providerRequestId: json.id,
      immediateVideoUrl: json.status === 'completed' ? json.video_url : undefined,
    }
  },

  async poll(modelId, providerRequestId): Promise<VideoPollResult> {
    if (modelId !== 'grok-imagine') throw new UnsupportedModelError(modelId, 'xai')

    const res = await fetch(`${XAI_BASE}/videos/generations/${providerRequestId}`, {
      headers: authHeaders(),
    })
    const json = (await res.json().catch(() => ({}))) as XAIVideoResponse
    if (!res.ok) return { status: 'failed', error: json.error ?? `HTTP ${res.status}` }

    switch (json.status) {
      case 'queued':
        return { status: 'queued' }
      case 'processing':
        return { status: 'rendering' }
      case 'failed':
        return { status: 'failed', error: json.error ?? 'grok job failed' }
      case 'completed':
        if (!json.video_url) return { status: 'failed', error: 'grok completed without a video URL' }
        return {
          status: 'completed',
          videoUrl: json.video_url,
          thumbnailUrl: json.thumbnail_url,
        }
      default:
        return { status: 'rendering' }
    }
  },
}
