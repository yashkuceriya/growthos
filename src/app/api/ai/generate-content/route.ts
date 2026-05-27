import { createClient } from '@/lib/supabase/server'
import { generateBlogPost } from '@/lib/ai/content/generator'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import { getMarketingMemory, marketingMemoryPrompt } from '@/lib/marketing/memory'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { projectId, topic, targetKeyword, audience, tone, outline, wordCount } = body

  if (!topic || !targetKeyword) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Unified marketing memory — pulls brand, blueprint, founder voice, and
  // any promoted-winner blog patterns into one block.
  const memory = projectId
    ? await getMarketingMemory({
        supabase,
        userId: user.id,
        projectId,
        assetKind: 'blog_post',
      })
    : null
  const styleContext = memory ? marketingMemoryPrompt(memory, 'blog') : undefined

  const result = await generateBlogPost({ topic, targetKeyword, audience, tone, outline, wordCount, styleContext })

  const model = 'google/gemini-2.0-flash-001'
  await trackAICost({
    userId: user.id,
    projectId,
    module: 'content_workshop',
    stepName: 'generate_blog',
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: estimateCost(model, result.inputTokens, result.outputTokens),
  })

  return Response.json(result.post)
}
