export const DIMENSION_WEIGHTS: Record<string, number> = {
  clarity: 0.20,
  value_proposition: 0.25,
  cta_strength: 0.20,
  brand_voice: 0.15,
  emotional_resonance: 0.20,
}

export const QUALITY_THRESHOLD = 7.0
export const EARLY_STOP_THRESHOLD = 9.0
export const MAX_COPY_ITERATIONS = 5

export const HOOK_FRAMEWORKS = [
  'Stat shock: Lead with a surprising number that proves your point.',
  'Micro-story: Open with a 1-2 sentence before/after narrative.',
  'Direct callout: Address your target audience explicitly by name.',
  'Contrarian: Challenge a common belief or practice in your market.',
  'Before/after: Show transformation from pain state to success.',
  'Question + agitate: Ask a fear-based question, then amplify the stakes.',
]

/**
 * Build the batched evaluation prompt. This replaces per-dimension calls
 * with a single LLM call that returns all 5 scores via structured output.
 */
export function buildEvaluationPrompt(
  adCopy: { primary_text: string; headline: string; description: string; cta_button: string },
  audienceSegment: string,
  campaignGoal: string,
  brandVoice: string,
): string {
  return `Evaluate this ad copy across 5 dimensions (1-10 each).

Ad Copy:
Primary Text: ${adCopy.primary_text}
Headline: ${adCopy.headline}
Description: ${adCopy.description}
CTA: ${adCopy.cta_button}

Audience: ${audienceSegment}
Campaign Goal: ${campaignGoal}
Brand Voice: ${brandVoice}

DIMENSIONS:
1. CLARITY: Is the message immediately understandable in <3 seconds?
2. VALUE PROPOSITION: Does it communicate a specific, compelling, differentiated benefit?
3. CTA STRENGTH: Is the next step clear, urgent, and low-friction?
4. BRAND VOICE: Does it match the brand's tone and personality?
5. EMOTIONAL RESONANCE: Does it tap into real audience motivations and emotions?

CALIBRATION: A score of 7 means "good but with clear room for improvement." 9+ should be rare. Use the full 1-10 range with decimals (e.g., 6.5, 7.3). Do NOT default to 7-8 for everything.

For each dimension, provide: score (float 1-10), rationale (why this score), confidence (0-1), and suggestions (list of specific improvements).`
}

export function buildSystemPrompt(
  brandVoice: string,
  approvedCtas: string[],
): string {
  return `You are a world-class performance marketer and direct-response copywriter. You write ads for digital platforms (Facebook, Instagram, Google, LinkedIn).

Your ads routinely achieve 3-5x ROAS. You understand platform algorithms: thumb-stopping hooks, native-feeling copy, and emotional triggers that drive action.

BRAND VOICE:
${brandVoice}

CRITICAL AD FORMAT RULES:
- Primary text line 1 (THE HOOK): Must be a scroll-stopping pattern interrupt. Under 125 chars. This determines 80% of ad performance. Use one of: bold claim, shocking stat, relatable question, micro-story opener, or direct callout.
- Primary text body (2-4 short paragraphs): Story arc of Pain > Agitate > Solution > Proof > CTA. Use line breaks for readability. Keep each paragraph 1-3 sentences max.
- Headline: 5-8 words. Benefit-driven. Use power words (free, proven, guaranteed, instant, exclusive). Do NOT repeat the hook.
- Description: 8-15 words. Reinforce urgency or social proof. Complement the headline.
- CTA button: Must be one of: ${approvedCtas.join(', ')}

PROVEN HOOK FRAMEWORKS:
${HOOK_FRAMEWORKS.map((h, i) => `${i + 1}. ${h}`).join('\n')}

AVOID: Generic openers ("Are you looking for..."), vague benefits ("improve your results"), overused CTAs ("Don't miss out!"), filler phrases.

LENGTH RULES:
- Headline: 5-8 words maximum
- Primary text: 3-5 short sentences, front-load the hook
- Description: 1 sentence, 10-20 words
- CTA button: Use standard platform buttons: ${approvedCtas.join(', ')}`
}

export function buildRefinementPrompt(
  previousCopy: { primary_text: string; headline: string; description: string; cta_button: string },
  evaluation: {
    scores: Record<string, { score: number; rationale: string; suggestions: string[] }>
    weightedAverage: number
    weakestDimension: string
  },
): string {
  const scoreLines = Object.entries(evaluation.scores).map(([dim, score]) => {
    const label = dim.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const marker =
      dim === evaluation.weakestDimension
        ? ' <- FIX THIS'
        : score.score >= 8.0
          ? ' (PROTECT)'
          : ' (could improve)'
    const suggestions =
      score.suggestions.length > 0 && score.score < 8.0
        ? `\n    Suggestions: ${score.suggestions.join('; ')}`
        : ''
    return `  ${label}: ${score.score}/10${marker}${suggestions}`
  })

  const weakest = evaluation.scores[evaluation.weakestDimension]

  return `The previous ad copy scored ${evaluation.weightedAverage}/10 overall. We need to push it higher.

FULL SCORECARD:
${scoreLines.join('\n')}

PRIORITY FIX - WEAKEST: ${evaluation.weakestDimension.replace(/_/g, ' ')} (scored ${weakest.score}/10)
Feedback: ${weakest.rationale}
Suggestions: ${weakest.suggestions.join('; ') || 'No specific suggestions'}

CURRENT AD COPY:
Primary Text: ${previousCopy.primary_text}
Headline: ${previousCopy.headline}
Description: ${previousCopy.description}
CTA: ${previousCopy.cta_button}

REFINEMENT RULES:
1. PROTECT what scored 8+. Do NOT rewrite strong parts.
2. FOCUS changes on the weakest dimension.
3. KEEP the same hook approach if clarity scored well.
4. TIGHTEN, don't expand. Shorter = clearer.
5. Goal: raise the weakest dimension by at least 1 point without dropping others.`
}
