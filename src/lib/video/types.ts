// Provider-agnostic video generation interface. Each provider exports a
// VideoProvider implementation; lib/video/index.ts dispatches by model id.
//
// Submit returns immediately with a request id. Providers vary in poll
// cadence — fal/openai/xai are all async — so callers persist the id and
// poll later (cron or on-demand from the UI).

export interface VideoSubmitArgs {
  prompt: string             // The visual description fed to the model
  durationSeconds: number    // Clamped to model's max_seconds upstream
  aspectRatio?: '16:9' | '9:16' | '1:1'
  // Optional reference image (image-to-video flow). Not all models support it.
  referenceImageUrl?: string
}

export interface VideoSubmitResult {
  providerRequestId: string
  // Some providers complete synchronously for short clips. If video_url is
  // already returned, we skip the rendering state and go straight to completed.
  immediateVideoUrl?: string
}

export interface VideoPollResult {
  status: 'queued' | 'rendering' | 'completed' | 'failed'
  videoUrl?: string
  thumbnailUrl?: string
  error?: string
  // Provider-reported actual cost; null when the provider doesn't expose it.
  costUsd?: number
}

export interface VideoProvider {
  readonly id: 'fal' | 'openai' | 'xai'
  /**
   * Submit a video render. Throws if the provider's required env var is
   * missing or the model id isn't supported by this provider.
   */
  submit(modelId: string, args: VideoSubmitArgs): Promise<VideoSubmitResult>
  /**
   * Poll status. Idempotent — providers return the same payload until the
   * job finishes.
   */
  poll(modelId: string, providerRequestId: string): Promise<VideoPollResult>
}

export class MissingProviderKeyError extends Error {
  constructor(public envVar: string, public providerId: string) {
    super(`${providerId} provider needs ${envVar} — set it in .env.local to enable this model`)
    this.name = 'MissingProviderKeyError'
  }
}

export class UnsupportedModelError extends Error {
  constructor(public modelId: string, public providerId: string) {
    super(`Model "${modelId}" is not supported by provider "${providerId}"`)
    this.name = 'UnsupportedModelError'
  }
}
