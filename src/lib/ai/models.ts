// Central model router. Strategic tasks → Claude Sonnet (if key present), else Gemini.
// Production tasks always → Gemini (cheap, fast, great at high-volume short copy).
// Images → Gemini 2.5/3.1 Flash Image.

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

export const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    'X-Title': 'GrowthOS',
  },
})

// Direct Anthropic client (preferred for strategic agents when key present)
export const anthropic = process.env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

export const MODEL_GEMINI_PRODUCTION = 'google/gemini-2.0-flash-001'
export const MODEL_GEMINI_IMAGE = 'google/gemini-3.1-flash-image-preview'
export const MODEL_CLAUDE_STRATEGIC = 'claude-sonnet-4-5-20250929'

/**
 * Pick the model for the task.
 * - 'strategic': CMO, Director, SEO strategist, Blog long-form, Competitive Intel, Brand Hub
 * - 'production': Meta ad, Twitter, TikTok, Reddit, Email, Landing, LinkedIn copy
 * - 'image': Gemini image gen
 */
export function modelFor(task: 'strategic' | 'production') {
  if (task === 'strategic' && anthropic) {
    return anthropic(MODEL_CLAUDE_STRATEGIC)
  }
  return openrouter(MODEL_GEMINI_PRODUCTION)
}

export function modelLabel(task: 'strategic' | 'production'): string {
  if (task === 'strategic' && anthropic) return MODEL_CLAUDE_STRATEGIC
  return MODEL_GEMINI_PRODUCTION
}
