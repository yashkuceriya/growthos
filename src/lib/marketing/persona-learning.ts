import type { LearningSummary } from '@/lib/campaigns/learning'

export interface CampaignPersonaLearning {
  campaign_id: string
  timestamp: string
  persona: {
    id: string
    name: string
    role: string | null
    skepticism_level: string | null
  }
  insight_signal: string | null
  best_channel: string | null
  worst_channel: string | null
  manual_task_count: number
  recommended_next: string[]
  summary: LearningSummary
}

export function campaignPersonaFromMetadata(metadata: Record<string, unknown> | null | undefined): CampaignPersonaLearning['persona'] | null {
  const direct = readPersona(metadata?.persona)
  if (direct) return direct

  const tracker = metadata?.manual_launch_tracker
  if (!tracker || typeof tracker !== 'object' || Array.isArray(tracker)) return null
  return readPersona((tracker as Record<string, unknown>).persona)
}

export function buildCampaignPersonaLearning(args: {
  campaignId: string
  metadata: Record<string, unknown> | null | undefined
  summary: LearningSummary
  timestamp?: string
}): CampaignPersonaLearning | null {
  const persona = campaignPersonaFromMetadata(args.metadata)
  if (!persona) return null
  return {
    campaign_id: args.campaignId,
    timestamp: args.timestamp ?? new Date().toISOString(),
    persona,
    insight_signal: personaInsightSignal(args.summary),
    best_channel: args.summary.bestChannel?.channel ?? null,
    worst_channel: args.summary.worstChannel?.channel ?? null,
    manual_task_count: args.summary.inputCounts.manualTasks,
    recommended_next: args.summary.recommendedNext.slice(0, 5),
    summary: args.summary,
  }
}

export function mergeCampaignPersonaLearning(
  insights: Record<string, unknown> | null | undefined,
  entry: CampaignPersonaLearning,
): Record<string, unknown> {
  const prev = insights && typeof insights === 'object' && !Array.isArray(insights) ? insights : {}
  const personaCurrent = readObjectMap(prev.persona_current)
  const personaHistory = readHistoryMap(prev.persona_history)
  const key = entry.persona.id
  const prior = personaHistory[key]?.slice(-4) ?? []
  return {
    ...prev,
    last_updated: entry.timestamp,
    last_persona_learning_campaign_id: entry.campaign_id,
    persona_current: {
      ...personaCurrent,
      [key]: entry,
    },
    persona_history: {
      ...personaHistory,
      [key]: [...prior, entry],
    },
  }
}

export function personaInsightSignal(summary: LearningSummary): string | null {
  if (summary.strongestHook) return summary.strongestHook
  if (summary.bestChannel) return `Best channel: ${summary.bestChannel.channel}`
  if (summary.recommendedNext.length > 0) return summary.recommendedNext[0]
  if (summary.inputCounts.manualTasks > 0) return `${summary.inputCounts.manualTasks} manual task${summary.inputCounts.manualTasks === 1 ? '' : 's'} completed`
  return null
}

function readPersona(raw: unknown): CampaignPersonaLearning['persona'] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : null
  const name = typeof row.name === 'string' ? row.name : null
  if (!id || !name) return null
  return {
    id,
    name,
    role: typeof row.role === 'string' ? row.role : null,
    skepticism_level: typeof row.skepticismLevel === 'string'
      ? row.skepticismLevel
      : typeof row.skepticism_level === 'string' ? row.skepticism_level : null,
  }
}

function readObjectMap(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readHistoryMap(value: unknown): Record<string, unknown[]> {
  const raw = readObjectMap(value)
  const out: Record<string, unknown[]> = {}
  for (const [key, list] of Object.entries(raw)) {
    if (Array.isArray(list)) out[key] = list
  }
  return out
}
