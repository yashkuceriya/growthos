import { generateObject } from 'ai'
import { openrouter } from '@/lib/ai/openrouter'
import { AdCopySchema, type AdCopy } from './schemas'
import { buildSystemPrompt, buildRefinementPrompt } from './rubrics'

const DEFAULT_CTAS = ['Learn More', 'Sign Up', 'Get Started', 'Book Now', 'Apply Now']
const MODEL_DRAFT = 'google/gemini-2.0-flash-001'
const MODEL_REFINE = 'google/gemini-2.0-flash-001'

interface GenerateParams {
  audienceSegment: string
  productOffer: string
  campaignGoal: string
  tone?: string
  brandVoice?: string
  competitorContext?: string[]
  insights?: string[]
}

interface GenerateResult {
  adCopy: AdCopy
  model: string
  inputTokens: number
  outputTokens: number
}

export async function generateAdCopy(params: GenerateParams): Promise<GenerateResult> {
  const brandVoice = params.brandVoice || 'Professional, approachable, results-focused'

  const systemPrompt = buildSystemPrompt(brandVoice, DEFAULT_CTAS)

  let userMessage = `Generate a high-converting ad.

AUDIENCE: ${params.audienceSegment}
PRODUCT/OFFER: ${params.productOffer}
CAMPAIGN GOAL: ${params.campaignGoal}
TONE: ${params.tone || 'professional but friendly'}`

  if (params.competitorContext?.length) {
    userMessage += `\n\nCOMPETITOR PATTERNS TO LEARN FROM:\n${params.competitorContext.map((c) => `- ${c}`).join('\n')}`
  }

  if (params.insights?.length) {
    userMessage += `\n\nINSIGHTS FROM PRIOR RUNS:\n${params.insights.map((i) => `- ${i}`).join('\n')}`
  }

  userMessage += `\n\nGenerate compelling ad copy that will stop the scroll and drive ${params.campaignGoal}.`

  const { object, usage } = await generateObject({
    model: openrouter(MODEL_DRAFT),
    schema: AdCopySchema,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  return {
    adCopy: object,
    model: MODEL_DRAFT,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}

export async function refineAdCopy(
  previousCopy: AdCopy,
  evaluation: {
    scores: Record<string, { score: number; rationale: string; suggestions: string[] }>
    weightedAverage: number
    weakestDimension: string
  },
  brandVoice?: string,
): Promise<GenerateResult> {
  const systemPrompt = buildSystemPrompt(
    brandVoice || 'Professional, approachable, results-focused',
    DEFAULT_CTAS,
  )

  const refinementPrompt = buildRefinementPrompt(previousCopy, evaluation)

  const { object, usage } = await generateObject({
    model: openrouter(MODEL_REFINE),
    schema: AdCopySchema,
    system: systemPrompt,
    messages: [{ role: 'user', content: refinementPrompt }],
  })

  return {
    adCopy: object,
    model: MODEL_REFINE,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}
