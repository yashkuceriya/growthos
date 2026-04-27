import { createServiceClient } from '@/lib/supabase/server'

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

/**
 * Append a row to ai_cost_ledger.
 *
 * **Why service client (not session client)**: trackAICost is called from
 * cron-driven flows (lib/jobs/ingest-queue → runIngest, video poll-tick,
 * launch generators when invoked from queue work, etc.) where there are
 * no user cookies. createClient() in those contexts returns an anonymous
 * client and RLS (`auth.uid() = user_id`) silently rejects the INSERT.
 * Result: every cron-driven AI call's cost was being SILENTLY DROPPED
 * from the ledger — dashboard "AI Spend" missed cron costs entirely.
 *
 * Service-client write is safe here: callers always have the user_id
 * from auth-time, and ai_cost_ledger entries are write-only audit data.
 * Read access is still RLS-gated for users so they only see their own.
 */
export async function trackAICost(entry: CostEntry) {
  const supabase = createServiceClient()

  const { error } = await supabase.from('ai_cost_ledger').insert({
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

  if (error) {
    // Don't throw — cost tracking is best-effort instrumentation, not a
    // hard requirement. But log so operators see ledger problems.
    console.error('[cost-tracker] ledger insert failed:', error.message)
  }
}

// Rough cost estimates per 1M tokens (input/output), USD
// Rough cost estimates per 1M tokens (input/output), USD. Update when
// you bump model SKUs in lib/ai/models.ts — estimateCost falls back to
// a generic mid-tier rate if the model isn't listed, but ai_cost_ledger
// numbers drift if this stays out of sync.
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'google/gemini-2.0-flash-001': { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'google/gemini-2.5-flash-preview': { input: 0.15, output: 0.60 },
  'google/gemini-3.1-flash-image-preview': { input: 0, output: 0 }, // billed per image, not per token
  'anthropic/claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
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

/** Track AI cost from a Vercel AI SDK v6 usage object (has inputTokens / outputTokens). */
export async function trackFromUsage(params: {
  userId: string
  projectId?: string
  module: string
  model: string
  usage: { inputTokens?: number; outputTokens?: number } | undefined
  latencyMs?: number
  stepName?: string
  metadata?: Record<string, unknown>
}) {
  const inputTokens = params.usage?.inputTokens ?? 0
  const outputTokens = params.usage?.outputTokens ?? 0
  const costUsd = estimateCost(params.model, inputTokens, outputTokens)
  await trackAICost({
    userId: params.userId,
    projectId: params.projectId,
    module: params.module,
    stepName: params.stepName,
    model: params.model,
    inputTokens,
    outputTokens,
    latencyMs: params.latencyMs,
    costUsd,
    metadata: params.metadata,
  })
}
