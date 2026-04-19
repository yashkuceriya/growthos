import { generateObject } from 'ai'
import { openrouter } from '@/lib/ai/openrouter'
import { BatchedEvaluationSchema, type EvaluationResult, type AdCopy } from './schemas'
import { DIMENSION_WEIGHTS, QUALITY_THRESHOLD, buildEvaluationPrompt } from './rubrics'

const MODEL_EVAL = 'google/gemini-2.0-flash-001'

interface EvaluateResult {
  evaluation: EvaluationResult
  model: string
  inputTokens: number
  outputTokens: number
}

export async function evaluateAdCopy(
  adCopy: AdCopy,
  audienceSegment: string,
  campaignGoal: string,
  brandVoice?: string,
): Promise<EvaluateResult> {
  const prompt = buildEvaluationPrompt(
    adCopy,
    audienceSegment,
    campaignGoal,
    brandVoice || 'Professional, approachable, results-focused',
  )

  const { object, usage } = await generateObject({
    model: openrouter(MODEL_EVAL),
    schema: BatchedEvaluationSchema,
    system:
      'You are an expert ad quality evaluator. Score ad copy precisely across 5 dimensions. Be calibrated: use the full 1-10 range.',
    messages: [{ role: 'user', content: prompt }],
  })

  // Compute weighted average
  const scores: EvaluationResult['scores'] = {}
  let weightedSum = 0
  let totalWeight = 0

  for (const [dim, score] of Object.entries(object)) {
    scores[dim] = score
    const weight = DIMENSION_WEIGHTS[dim] ?? 0.2
    weightedSum += score.score * weight
    totalWeight += weight
  }

  const weightedAverage = Math.round((weightedSum / totalWeight) * 100) / 100

  // Find weakest dimension
  let weakestDimension = 'clarity'
  let weakestScore = 11
  for (const [dim, score] of Object.entries(scores)) {
    if (score.score < weakestScore) {
      weakestScore = score.score
      weakestDimension = dim
    }
  }

  return {
    evaluation: {
      scores,
      weightedAverage,
      weakestDimension,
      passesThreshold: weightedAverage >= QUALITY_THRESHOLD,
    },
    model: MODEL_EVAL,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}
