// Generate a 10-sec video. The body either provides a fully-formed
// `visualPrompt` (when the caller already has one — e.g. ad-studio reusing
// the ad's visual brief) or a `topic` we expand via generateVideoScript().
//
// Returns the render row id immediately. Caller polls /api/video/poll/:id.

export const runtime = 'nodejs'
export const maxDuration = 60

import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { submitVideoRender } from '@/lib/video'
import { defaultModel, getModel } from '@/lib/video/models'
import { generateVideoScript } from '@/lib/ai/video/script'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'

const BodySchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  topic: z.string().optional(),
  visualPrompt: z.string().optional(),
  hookCaption: z.string().optional(),
  mode: z.string().optional(),
  modelId: z.string().optional(),
  durationSeconds: z.number().int().min(3).max(15).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional(),
  referenceImageUrl: z.string().url().optional(),
  attachTo: z.object({
    type: z.enum(['ad_copy', 'social_post']),
    id: z.string().uuid(),
  }).optional(),
})

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const body = parsed.data

  if (!body.topic && !body.visualPrompt) {
    return Response.json({ error: 'Provide either topic or visualPrompt' }, { status: 400 })
  }

  const model = body.modelId ? getModel(body.modelId) : defaultModel()
  if (!model) {
    return Response.json({ error: `Unknown model: ${body.modelId}` }, { status: 400 })
  }

  // AI budget cap — script generation + video render both bill
  if (body.projectId) {
    const budget = await checkBudget(supabase, body.projectId)
    if (!budget.ok) return budgetExceededResponse(budget)
  }

  // Resolve to a final visual prompt
  let visualPrompt = body.visualPrompt
  let hookCaption = body.hookCaption
  if (!visualPrompt && body.topic) {
    const startedAt = Date.now()
    try {
      const result = await generateVideoScript({
        topic: body.topic,
        mode: body.mode,
        durationSeconds: body.durationSeconds ?? 10,
      })
      visualPrompt = result.script.visual_prompt
      hookCaption = hookCaption ?? result.script.hook_caption

      await trackAICost({
        userId: user.id,
        projectId: body.projectId ?? undefined,
        module: 'video_script',
        model: 'google/gemini-2.0-flash-001',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: estimateCost('google/gemini-2.0-flash-001', result.inputTokens, result.outputTokens),
        latencyMs: Date.now() - startedAt,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Script generation failed'
      return Response.json({ error: `Script: ${msg}` }, { status: 502 })
    }
  }

  // Render via service client — RLS would block service-side updates from
  // some chained operations otherwise.
  const service = createServiceClient()
  const result = await submitVideoRender({
    supabase: service,
    userId: user.id,
    projectId: body.projectId ?? null,
    modelId: model.id,
    prompt: visualPrompt!,
    durationSeconds: body.durationSeconds ?? 10,
    aspectRatio: body.aspectRatio,
    referenceImageUrl: body.referenceImageUrl,
    attachTo: body.attachTo,
    metadata: {
      mode: body.mode ?? null,
      hook_caption: hookCaption ?? null,
      topic: body.topic ?? null,
    },
  })

  // Estimate the video render cost too (provider-reported actual lands at poll time)
  if (body.projectId && result.status !== 'failed') {
    await trackAICost({
      userId: user.id,
      projectId: body.projectId,
      module: 'video_generation',
      model: model.id,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: model.cost_usd_per_clip,
    }).catch(() => {})
  }

  return Response.json({
    renderId: result.renderId,
    status: result.status,
    model: model.id,
    videoUrl: result.videoUrl,
    error: result.error,
    hookCaption,
  })
}

export const POST = wrapHandler(handlePost, 'ai/generate-video')
