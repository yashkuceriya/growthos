// OpenAI Sora provider. v1 implementation against the public Sora API
// pattern (POST /v1/videos, GET /v1/videos/{id}). Throws cleanly when
// OPENAI_API_KEY is missing so the UI can surface the gap rather than
// silently 500.

import type {
  VideoProvider,
  VideoSubmitResult,
  VideoPollResult,
} from '../types'
import { MissingProviderKeyError, UnsupportedModelError } from '../types'

const OPENAI_BASE = 'https://api.openai.com/v1'

function authHeaders(): HeadersInit {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new MissingProviderKeyError('OPENAI_API_KEY', 'openai')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

interface SoraVideoResponse {
  id: string
  status?: 'queued' | 'in_progress' | 'completed' | 'failed'
  error?: { message: string }
  output?: { url?: string; thumbnail_url?: string }
}

export const openaiProvider: VideoProvider = {
  id: 'openai',

  async submit(modelId, args): Promise<VideoSubmitResult> {
    if (modelId !== 'sora-2') throw new UnsupportedModelError(modelId, 'openai')

    const res = await fetch(`${OPENAI_BASE}/videos`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: 'sora-2',
        prompt: args.prompt,
        duration: Math.min(args.durationSeconds, 10),
        aspect_ratio: args.aspectRatio ?? '16:9',
        ...(args.referenceImageUrl ? { input_image_url: args.referenceImageUrl } : {}),
      }),
    })
    const json = (await res.json().catch(() => ({}))) as SoraVideoResponse
    if (!res.ok || !json.id) {
      throw new Error(`openai submit: ${json.error?.message ?? `HTTP ${res.status}`}`)
    }
    return { providerRequestId: json.id }
  },

  async poll(modelId, providerRequestId): Promise<VideoPollResult> {
    if (modelId !== 'sora-2') throw new UnsupportedModelError(modelId, 'openai')

    const res = await fetch(`${OPENAI_BASE}/videos/${providerRequestId}`, {
      headers: authHeaders(),
    })
    const json = (await res.json().catch(() => ({}))) as SoraVideoResponse
    if (!res.ok) return { status: 'failed', error: json.error?.message ?? `HTTP ${res.status}` }

    switch (json.status) {
      case 'queued':
        return { status: 'queued' }
      case 'in_progress':
        return { status: 'rendering' }
      case 'failed':
        return { status: 'failed', error: json.error?.message ?? 'sora job failed' }
      case 'completed':
        if (!json.output?.url) return { status: 'failed', error: 'sora completed without a video URL' }
        return {
          status: 'completed',
          videoUrl: json.output.url,
          thumbnailUrl: json.output.thumbnail_url,
        }
      default:
        return { status: 'rendering' }
    }
  },
}
