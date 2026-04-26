// Video generation dispatcher. Routes (model id → provider) and adapts the
// provider result into our DB schema (video_renders rows). Callers pass a
// supabase service client so we can write through RLS.

import type { SupabaseClient } from '@supabase/supabase-js'
import { falProvider } from './providers/fal'
import { openaiProvider } from './providers/openai'
import { xaiProvider } from './providers/xai'
import type { VideoProvider, VideoSubmitArgs } from './types'
import { MissingProviderKeyError } from './types'
import { getModel } from './models'
import type { VideoModel } from './models'
import { mirrorToStorage } from './storage'

const PROVIDERS: Record<string, VideoProvider> = {
  fal: falProvider,
  openai: openaiProvider,
  xai: xaiProvider,
}

function providerFor(model: VideoModel): VideoProvider {
  const p = PROVIDERS[model.provider]
  if (!p) throw new Error(`No provider registered for "${model.provider}"`)
  return p
}

export interface SubmitRenderArgs {
  supabase: SupabaseClient
  userId: string
  projectId: string | null
  modelId: string
  prompt: string
  durationSeconds: number
  aspectRatio?: '16:9' | '9:16' | '1:1'
  referenceImageUrl?: string
  attachTo?: { type: 'ad_copy' | 'social_post'; id: string }
  metadata?: Record<string, unknown>
}

export interface SubmitRenderResult {
  renderId: string
  status: 'queued' | 'rendering' | 'completed' | 'failed'
  videoUrl?: string
  error?: string
}

export async function submitVideoRender(args: SubmitRenderArgs): Promise<SubmitRenderResult> {
  const model = getModel(args.modelId)
  if (!model) {
    return { renderId: '', status: 'failed', error: `Unknown model: ${args.modelId}` }
  }

  const provider = providerFor(model)
  const submitArgs: VideoSubmitArgs = {
    prompt: args.prompt,
    durationSeconds: Math.min(args.durationSeconds, model.max_seconds),
    aspectRatio: args.aspectRatio,
    referenceImageUrl: args.referenceImageUrl,
  }

  // Insert the row first so we can record the failure too if submit() throws.
  const { data: row, error: insertErr } = await args.supabase
    .from('video_renders')
    .insert({
      user_id: args.userId,
      project_id: args.projectId,
      model: model.id,
      provider: model.provider,
      prompt: args.prompt,
      duration_seconds: submitArgs.durationSeconds,
      attached_to_type: args.attachTo?.type ?? null,
      attached_to_id: args.attachTo?.id ?? null,
      metadata: args.metadata ?? {},
      status: 'queued',
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (insertErr || !row) {
    return { renderId: '', status: 'failed', error: insertErr?.message ?? 'Failed to record render' }
  }

  try {
    const submit = await provider.submit(model.id, submitArgs)
    const completed = !!submit.immediateVideoUrl
    await args.supabase
      .from('video_renders')
      .update({
        provider_request_id: submit.providerRequestId,
        status: completed ? 'completed' : 'rendering',
        video_url: submit.immediateVideoUrl ?? null,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq('id', row.id)

    if (completed && args.attachTo) {
      await attachVideoToParent(args.supabase, args.attachTo, row.id, submit.immediateVideoUrl!)
    }

    return {
      renderId: row.id,
      status: completed ? 'completed' : 'rendering',
      videoUrl: submit.immediateVideoUrl,
    }
  } catch (err) {
    const isKeyMissing = err instanceof MissingProviderKeyError
    const msg = err instanceof Error ? err.message : 'Submit failed'
    await args.supabase
      .from('video_renders')
      .update({
        status: 'failed',
        error: msg,
        metadata: { provider_key_missing: isKeyMissing },
      })
      .eq('id', row.id)
    return { renderId: row.id, status: 'failed', error: msg }
  }
}

export async function pollVideoRender(
  supabase: SupabaseClient,
  renderId: string,
): Promise<SubmitRenderResult> {
  const { data } = await supabase
    .from('video_renders')
    .select('*')
    .eq('id', renderId)
    .maybeSingle() as { data: VideoRenderRow | null }

  if (!data) return { renderId, status: 'failed', error: 'Render not found' }
  if (data.status === 'completed' && data.video_url) {
    return { renderId, status: 'completed', videoUrl: data.video_url }
  }
  if (data.status === 'failed') return { renderId, status: 'failed', error: data.error ?? undefined }
  if (!data.provider_request_id) return { renderId, status: data.status as SubmitRenderResult['status'] }

  const model = getModel(data.model)
  if (!model) {
    return { renderId, status: 'failed', error: `Stale model id: ${data.model}` }
  }
  const provider = providerFor(model)

  try {
    const result = await provider.poll(model.id, data.provider_request_id)
    const update: Record<string, unknown> = { status: result.status }
    let finalUrl = result.videoUrl

    if (result.status === 'completed' && finalUrl) {
      // Optionally mirror the upstream signed URL to Supabase Storage so the
      // video survives provider expiry. mirrorToStorage no-ops when the env
      // var isn't set; on failure we keep the upstream URL.
      const mirror = await mirrorToStorage(supabase, {
        renderId,
        userId: data.user_id,
        sourceUrl: finalUrl,
      })
      // Merge mirror status into existing metadata — never overwrite. The
      // submit path stamps {mode, hook_caption, topic} which we want to
      // preserve through completion so downstream UIs (and the Video Studio
      // gallery) can show why each clip was generated.
      const baseMeta = (data.metadata ?? {}) as Record<string, unknown>
      if (mirror.mirrored && mirror.newUrl) {
        finalUrl = mirror.newUrl
        update.metadata = { ...baseMeta, mirrored_from: result.videoUrl, mirrored: true }
      } else if (mirror.error) {
        update.metadata = { ...baseMeta, mirror_error: mirror.error }
      }

      update.video_url = finalUrl
      update.thumbnail_url = result.thumbnailUrl ?? null
      update.completed_at = new Date().toISOString()
      update.cost_usd = result.costUsd ?? model.cost_usd_per_clip
    }
    if (result.status === 'failed') update.error = result.error ?? null
    await supabase.from('video_renders').update(update).eq('id', renderId)

    if (result.status === 'completed' && data.attached_to_type && data.attached_to_id && finalUrl) {
      await attachVideoToParent(
        supabase,
        { type: data.attached_to_type as 'ad_copy' | 'social_post', id: data.attached_to_id },
        renderId,
        finalUrl,
      )
    }

    return {
      renderId,
      status: result.status,
      videoUrl: finalUrl,
      error: result.error,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Poll failed'
    await supabase.from('video_renders').update({ status: 'failed', error: msg }).eq('id', renderId)
    return { renderId, status: 'failed', error: msg }
  }
}

interface VideoRenderRow {
  id: string
  user_id: string
  status: string
  model: string
  provider_request_id: string | null
  video_url: string | null
  error: string | null
  attached_to_type: string | null
  attached_to_id: string | null
  metadata: Record<string, unknown> | null
}

async function attachVideoToParent(
  supabase: SupabaseClient,
  attach: { type: 'ad_copy' | 'social_post'; id: string },
  renderId: string,
  videoUrl: string,
) {
  const table = attach.type === 'ad_copy' ? 'ad_copies' : 'social_posts'
  await supabase
    .from(table)
    .update({
      video_url: videoUrl,
      video_render_id: renderId,
      video_status: 'completed',
    })
    .eq('id', attach.id)
}

export { VIDEO_MODELS, getModel, defaultModel } from './models'
export { CREATIVE_MODES, getMode, modeBlock, DEFAULT_MODE_ID } from '@/lib/ai/creative/modes'
