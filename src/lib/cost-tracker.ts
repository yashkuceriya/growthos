import { createClient } from '@/lib/supabase/server'

interface CostEntry {
  userId: string
  projectId?: string
  module: string
  stepName?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  latencyMs?: number
  costUsd?: number
  metadata?: Record<string, unknown>
}

export async function trackAICost(entry: CostEntry) {
  const supabase = await createClient()

  await supabase.from('ai_cost_ledger').insert({
    user_id: entry.userId,
    project_id: entry.projectId ?? null,
    module: entry.module,
    step_name: entry.stepName ?? null,
    model: entry.model ?? null,
    input_tokens: entry.inputTokens ?? 0,
    output_tokens: entry.outputTokens ?? 0,
    latency_ms: entry.latencyMs ?? null,
    cost_usd: entry.costUsd ?? null,
    metadata: entry.metadata ?? {},
  })
}

// Rough cost estimates per 1M tokens (input/output)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'google/gemini-2.0-flash-001': { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash-preview': { input: 0.15, output: 0.60 },
  'anthropic/claude-sonnet-4': { input: 3.0, output: 15.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model] ?? { input: 0.5, output: 1.5 }
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000
}
