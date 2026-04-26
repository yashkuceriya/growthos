// fal.ai provider — covers Kling, Veo, Runway, Hailuo via their queue API.
//
// All fal models follow the same submit/poll pattern:
//   POST   https://queue.fal.run/<upstream_id>            → { request_id }
//   GET    https://queue.fal.run/<upstream_id>/requests/<id>/status
//   GET    https://queue.fal.run/<upstream_id>/requests/<id>           (response when done)
//
// Each model has its own input schema; we map our normalized args to the
// per-model payload via PER_MODEL_INPUT.

import type {
  VideoProvider,
  VideoSubmitArgs,
  VideoSubmitResult,
  VideoPollResult,
} from '../types'
import { MissingProviderKeyError, UnsupportedModelError } from '../types'
import { getModel } from '../models'

const FAL_BASE = 'https://queue.fal.run'

function authHeaders(): HeadersInit {
  const key = process.env.FAL_KEY
  if (!key) throw new MissingProviderKeyError('FAL_KEY', 'fal')
  return {
    Authorization: `Key ${key}`,
    'Content-Type': 'application/json',
  }
}

interface FalSubmitResponse {
  request_id?: string
  status?: string
  detail?: string
}

interface FalStatusResponse {
  status?: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  logs?: Array<{ message: string }>
}

interface FalResultResponse {
  video?: { url: string }
  output?: { video?: { url: string } | string }
  thumbnail_url?: string
  error?: string
  detail?: string
}

/**
 * Per-model input shape. Everyone takes a `prompt` field but model-specific
 * fields differ — keep these explicit so a Kling change doesn't silently
 * leak into a Veo render and vice versa.
 */
function buildPayload(modelId: string, args: VideoSubmitArgs): Record<string, unknown> {
  const aspect = args.aspectRatio ?? '16:9'
  switch (modelId) {
    case 'kling-2':
      return {
        prompt: args.prompt,
        duration: String(Math.min(args.durationSeconds, 10)),
        aspect_ratio: aspect,
        ...(args.referenceImageUrl ? { image_url: args.referenceImageUrl } : {}),
      }
    case 'veo-3':
      return {
        prompt: args.prompt,
        duration: `${Math.min(args.durationSeconds, 8)}s`,
        aspect_ratio: aspect,
      }
    case 'runway-gen4':
      return {
        prompt: args.prompt,
        duration: Math.min(args.durationSeconds, 10),
        aspect_ratio: aspect,
        ...(args.referenceImageUrl ? { image_url: args.referenceImageUrl } : {}),
      }
    case 'hailuo-02':
      return {
        prompt: args.prompt,
        duration: Math.min(args.durationSeconds, 6),
        prompt_optimizer: true,
      }
    default:
      throw new UnsupportedModelError(modelId, 'fal')
  }
}

export const falProvider: VideoProvider = {
  id: 'fal',

  async submit(modelId, args): Promise<VideoSubmitResult> {
    const model = getModel(modelId)
    if (!model || model.provider !== 'fal') throw new UnsupportedModelError(modelId, 'fal')

    const payload = buildPayload(modelId, args)
    const res = await fetch(`${FAL_BASE}/${model.upstream_id}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as FalSubmitResponse
    if (!res.ok || !json.request_id) {
      throw new Error(`fal submit: ${json.detail ?? `HTTP ${res.status}`}`)
    }
    return { providerRequestId: json.request_id }
  },

  async poll(modelId, providerRequestId): Promise<VideoPollResult> {
    const model = getModel(modelId)
    if (!model || model.provider !== 'fal') throw new UnsupportedModelError(modelId, 'fal')

    const statusRes = await fetch(
      `${FAL_BASE}/${model.upstream_id}/requests/${providerRequestId}/status`,
      { headers: authHeaders() },
    )
    const statusJson = (await statusRes.json().catch(() => ({}))) as FalStatusResponse

    if (statusJson.status === 'IN_QUEUE') return { status: 'queued' }
    if (statusJson.status === 'IN_PROGRESS') return { status: 'rendering' }
    if (statusJson.status === 'FAILED') {
      const lastLog = statusJson.logs?.[statusJson.logs.length - 1]?.message
      return { status: 'failed', error: lastLog ?? 'fal job failed' }
    }
    if (statusJson.status !== 'COMPLETED') {
      // Unexpected status — treat as still rendering rather than failing the row.
      return { status: 'rendering' }
    }

    // Completed — fetch the actual result
    const resultRes = await fetch(
      `${FAL_BASE}/${model.upstream_id}/requests/${providerRequestId}`,
      { headers: authHeaders() },
    )
    const result = (await resultRes.json().catch(() => ({}))) as FalResultResponse
    if (!resultRes.ok) {
      return { status: 'failed', error: result.detail ?? `HTTP ${resultRes.status}` }
    }

    // Different fal models nest the video URL in different places.
    const videoUrl =
      result.video?.url ??
      (typeof result.output?.video === 'string'
        ? result.output.video
        : result.output?.video?.url)

    if (!videoUrl) {
      return { status: 'failed', error: 'No video URL in fal response' }
    }
    return {
      status: 'completed',
      videoUrl,
      thumbnailUrl: result.thumbnail_url,
    }
  },
}
