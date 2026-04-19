import { z } from 'zod'

export const AdCopySchema = z.object({
  primary_text: z.string().describe('Main copy above image, stops the scroll'),
  headline: z.string().describe('Bold text below image, 5-8 words max'),
  description: z.string().describe('Secondary text below headline'),
  cta_button: z.string().describe('CTA button text: Learn More, Sign Up, Get Started, etc.'),
})

export type AdCopy = z.infer<typeof AdCopySchema>

export const DimensionScoreSchema = z.object({
  score: z.number().min(1).max(10),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
  suggestions: z.array(z.string()),
})

export type DimensionScore = z.infer<typeof DimensionScoreSchema>

export const BatchedEvaluationSchema = z.object({
  clarity: DimensionScoreSchema,
  value_proposition: DimensionScoreSchema,
  cta_strength: DimensionScoreSchema,
  brand_voice: DimensionScoreSchema,
  emotional_resonance: DimensionScoreSchema,
})

export type BatchedEvaluation = z.infer<typeof BatchedEvaluationSchema>

export interface EvaluationResult {
  scores: Record<string, DimensionScore>
  weightedAverage: number
  weakestDimension: string
  passesThreshold: boolean
}

export interface ComplianceViolation {
  severity: 'error' | 'warning'
  field: string
  rule: string
  message: string
  suggestion: string
}

export interface ComplianceResult {
  passes: boolean
  violations: ComplianceViolation[]
  score: number
}

export interface CopyIteration {
  iterationNumber: number
  adCopy: AdCopy
  evaluation: EvaluationResult
  refinementFeedback: string | null
}
