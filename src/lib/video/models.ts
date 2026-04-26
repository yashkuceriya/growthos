// The catalog the UI picker reads from. cost_usd_per_clip is rough — used to
// show "$" estimates next to the model and to seed video_renders.cost_usd
// when the provider doesn't return a real billed amount. max_seconds is what
// we clamp duration to before submitting.

export type ProviderId = 'fal' | 'openai' | 'xai'

export interface VideoModel {
  id: string
  label: string
  provider: ProviderId
  /** Human-friendly id used by the upstream API (e.g. fal-ai/kling-video/v2/master/text-to-video). */
  upstream_id: string
  cost_usd_per_clip: number
  max_seconds: number
  supports_image_init: boolean
  description: string
  default?: boolean
}

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'kling-2',
    label: 'Kling 2.0',
    provider: 'fal',
    upstream_id: 'fal-ai/kling-video/v2/master/text-to-video',
    cost_usd_per_clip: 1.0,
    max_seconds: 10,
    supports_image_init: true,
    description: 'Best price/quality. Strong motion, native 10s.',
    default: true,
  },
  {
    id: 'veo-3',
    label: 'Veo 3',
    provider: 'fal',
    upstream_id: 'fal-ai/veo3',
    cost_usd_per_clip: 2.5,
    max_seconds: 8,
    supports_image_init: false,
    description: 'Google\'s top-tier model. Cinematic, slow, premium.',
  },
  {
    id: 'runway-gen4',
    label: 'Runway Gen-4 Turbo',
    provider: 'fal',
    upstream_id: 'fal-ai/runway-gen4-turbo',
    cost_usd_per_clip: 0.8,
    max_seconds: 10,
    supports_image_init: true,
    description: 'Fast cinematic. Great for ad B-roll.',
  },
  {
    id: 'hailuo-02',
    label: 'Hailuo 02',
    provider: 'fal',
    upstream_id: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    cost_usd_per_clip: 0.1,
    max_seconds: 6,
    supports_image_init: false,
    description: 'Cheapest. Lower res, fine for drafts.',
  },
  {
    id: 'sora-2',
    label: 'Sora 2',
    provider: 'openai',
    upstream_id: 'sora-2',
    cost_usd_per_clip: 1.5,
    max_seconds: 10,
    supports_image_init: true,
    description: 'OpenAI native. Strong physics + text in scene.',
  },
  {
    id: 'grok-imagine',
    label: 'Grok Imagine',
    provider: 'xai',
    upstream_id: 'grok-imagine',
    cost_usd_per_clip: 0.5,
    max_seconds: 6,
    supports_image_init: false,
    description: 'xAI. Lean to funny / shocking modes.',
  },
]

const MODEL_BY_ID = new Map(VIDEO_MODELS.map((m) => [m.id, m]))

export function getModel(id: string): VideoModel | null {
  return MODEL_BY_ID.get(id) ?? null
}

export function defaultModel(): VideoModel {
  return VIDEO_MODELS.find((m) => m.default) ?? VIDEO_MODELS[0]!
}
