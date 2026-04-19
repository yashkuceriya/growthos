import { generateAdCopy, refineAdCopy } from './generator'
import { evaluateAdCopy } from './evaluator'
import { checkCompliance } from './compliance'
import { QUALITY_THRESHOLD, EARLY_STOP_THRESHOLD, MAX_COPY_ITERATIONS } from './rubrics'
import type { AdCopy, CopyIteration, EvaluationResult, ComplianceResult } from './schemas'

interface IteratorParams {
  audienceSegment: string
  productOffer: string
  campaignGoal: string
  tone?: string
  brandVoice?: string
  competitorContext?: string[]
  insights?: string[]
  platform?: 'meta' | 'google' | 'linkedin' | 'tiktok'
  maxIterations?: number
  onProgress?: (message: string) => void
}

interface IteratorResult {
  iterations: CopyIteration[]
  bestIteration: CopyIteration
  earlyStopped: boolean
  earlyStopReason: string | null
  compliance: ComplianceResult
  totalInputTokens: number
  totalOutputTokens: number
}

export async function runAdPipeline(params: IteratorParams): Promise<IteratorResult> {
  const maxIter = params.maxIterations ?? MAX_COPY_ITERATIONS
  const iterations: CopyIteration[] = []
  let earlyStopped = false
  let earlyStopReason: string | null = null
  let totalInputTokens = 0
  let totalOutputTokens = 0

  let previousCopy: AdCopy | null = null
  let previousEvaluation: EvaluationResult | null = null

  for (let i = 1; i <= maxIter; i++) {
    params.onProgress?.(`Iteration ${i}/${maxIter}: Generating ad copy...`)

    // Generate (or refine)
    let genResult
    if (previousCopy && previousEvaluation) {
      genResult = await refineAdCopy(previousCopy, previousEvaluation, params.brandVoice)
    } else {
      genResult = await generateAdCopy({
        audienceSegment: params.audienceSegment,
        productOffer: params.productOffer,
        campaignGoal: params.campaignGoal,
        tone: params.tone,
        brandVoice: params.brandVoice,
        competitorContext: params.competitorContext,
        insights: params.insights,
      })
    }

    totalInputTokens += genResult.inputTokens
    totalOutputTokens += genResult.outputTokens

    // Evaluate
    params.onProgress?.(`Iteration ${i}/${maxIter}: Evaluating quality...`)

    const evalResult = await evaluateAdCopy(
      genResult.adCopy,
      params.audienceSegment,
      params.campaignGoal,
      params.brandVoice,
    )

    totalInputTokens += evalResult.inputTokens
    totalOutputTokens += evalResult.outputTokens

    const score = evalResult.evaluation.weightedAverage
    params.onProgress?.(
      `Iteration ${i}: Score ${score.toFixed(1)}/10 (weakest: ${evalResult.evaluation.weakestDimension} @ ${evalResult.evaluation.scores[evalResult.evaluation.weakestDimension].score.toFixed(1)})`,
    )

    const iteration: CopyIteration = {
      iterationNumber: i,
      adCopy: genResult.adCopy,
      evaluation: evalResult.evaluation,
      refinementFeedback: null,
    }

    iterations.push(iteration)

    // Early stop: exceptional quality
    if (score >= EARLY_STOP_THRESHOLD) {
      earlyStopped = true
      earlyStopReason = `Exceptional quality (${score.toFixed(1)} >= ${EARLY_STOP_THRESHOLD})`
      params.onProgress?.(`Early stop: ${earlyStopReason}`)
      break
    }

    // Early stop: passing threshold after 2+ iterations
    if (i >= 2 && score >= QUALITY_THRESHOLD) {
      earlyStopped = true
      earlyStopReason = `Quality threshold met (${score.toFixed(1)} >= ${QUALITY_THRESHOLD})`
      params.onProgress?.(`Early stop: ${earlyStopReason}`)
      break
    }

    // Prepare refinement for next iteration
    if (i < maxIter) {
      previousCopy = genResult.adCopy
      previousEvaluation = evalResult.evaluation
    }
  }

  // Get best iteration (highest weighted average)
  const bestIteration = iterations.reduce((best, curr) =>
    curr.evaluation.weightedAverage > best.evaluation.weightedAverage ? curr : best,
  )

  // Run compliance check on best copy
  params.onProgress?.('Running compliance check...')
  const compliance = checkCompliance(bestIteration.adCopy, params.platform)

  params.onProgress?.(`Pipeline complete! Best score: ${bestIteration.evaluation.weightedAverage.toFixed(1)}/10, Compliance: ${compliance.passes ? 'PASS' : 'FAIL'}`)

  return {
    iterations,
    bestIteration,
    earlyStopped,
    earlyStopReason,
    compliance,
    totalInputTokens,
    totalOutputTokens,
  }
}
