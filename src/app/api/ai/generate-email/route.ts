import { createClient } from '@/lib/supabase/server'
import { generateEmailCopy } from '@/lib/ai/email/generator'
import { trackAICost, estimateCost } from '@/lib/cost-tracker'
import { getMarketingMemory, marketingMemoryPrompt } from '@/lib/marketing/memory'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { projectId, purpose, audience, tone, brandVoice, productName, keyPoints, emailType } = body

  if (!purpose || !audience || !emailType) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Unified marketing memory — brand, blueprint, founder voice, and
  // promoted-winner email templates in one block. Skipped for ad-hoc
  // generations without a projectId.
  const memory = projectId
    ? await getMarketingMemory({
        supabase,
        userId: user.id,
        projectId,
        assetKind: 'email_template',
      })
    : null
  const memoryBlock = memory ? marketingMemoryPrompt(memory, 'email') : ''
  const styleContext = [memoryBlock, brandVoice].filter(Boolean).join('\n\n').trim() || undefined

  const result = await generateEmailCopy({
    purpose,
    audience,
    tone,
    // Memory covers brand context inside styleContext; avoid double-printing.
    brandVoice: undefined,
    productName,
    keyPoints,
    emailType,
    styleContext,
  })

  const model = 'google/gemini-2.0-flash-001'
  await trackAICost({
    userId: user.id,
    projectId,
    module: 'email_engine',
    stepName: 'generate_email',
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: estimateCost(model, result.inputTokens, result.outputTokens),
  })

  return Response.json(result.email)
}
