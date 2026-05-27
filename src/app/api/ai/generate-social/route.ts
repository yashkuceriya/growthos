import { createClient } from '@/lib/supabase/server'
import { generateSocialPost } from '@/lib/ai/social/generator'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import { modeBlock } from '@/lib/ai/creative/modes'
import { getMarketingMemory, marketingMemoryPrompt } from '@/lib/marketing/memory'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { projectId, platform, topic, audience, tone, brandVoice, contentType, creativeMode } = body

  if (!platform || !topic) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Unified marketing memory keyed on the platform so promoted-winner posts
  // for THIS platform feed back into the prompt. Falls back gracefully when
  // no projectId is provided (e.g. one-off ad-hoc posts).
  const memory = projectId
    ? await getMarketingMemory({
        supabase,
        userId: user.id,
        projectId,
        assetKind: `${platform}_post`,
        channel: platform,
      })
    : null

  // Compose the system-prompt block. Memory provides brand, blueprint,
  // founder voice, and proven style refs in one block. Caller's brandVoice
  // (if any) gets appended for ad-hoc overrides. Creative-mode directive
  // tacked on so "funny" mode still bends the angle.
  const memoryBlock = memory ? marketingMemoryPrompt(memory, 'social_post') : ''
  const styleContext = [memoryBlock, brandVoice, modeBlock(creativeMode, 'copy')]
    .filter(Boolean)
    .join('\n\n')
    .trim() || undefined

  const result = await generateSocialPost({
    platform,
    topic,
    audience,
    tone,
    // Pass undefined so the generator doesn't double-print brand voice —
    // memory already covers brand context in styleContext.
    brandVoice: undefined,
    contentType,
    styleContext,
  })

  const model = 'google/gemini-2.0-flash-001'
  await trackAICost({
    userId: user.id,
    projectId,
    module: 'social_scheduler',
    stepName: 'generate_post',
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: estimateCost(model, result.inputTokens, result.outputTokens),
  })

  return Response.json(result.post)
}
