import { describe, expect, it } from 'vitest'
import type { LearningSummary } from '@/lib/campaigns/learning'
import { buildCampaignPersonaLearning, campaignPersonaFromMetadata, mergeCampaignPersonaLearning, personaInsightSignal } from './persona-learning'

function summary(overrides: Partial<LearningSummary> = {}): LearningSummary {
  return {
    generatedAt: '2026-06-12T01:00:00.000Z',
    bestChannel: null,
    worstChannel: null,
    bestAsset: null,
    strongestHook: null,
    recommendedNext: [],
    decisionLoop: { doNow: [], stopDoing: [], testNext: [] },
    reusableStyleNotes: [],
    inputCounts: { metrics: 0, ads: 0, social: 0, email: 0, manualTasks: 0 },
    ...overrides,
  }
}

describe('campaign persona learning', () => {
  it('reads persona from top-level campaign metadata', () => {
    expect(campaignPersonaFromMetadata({
      persona: { id: 'persona-1', name: 'Founder Operator', role: 'Founder', skepticismLevel: 'high' },
    })).toEqual({
      id: 'persona-1',
      name: 'Founder Operator',
      role: 'Founder',
      skepticism_level: 'high',
    })
  })

  it('falls back to manual worklog persona metadata', () => {
    expect(campaignPersonaFromMetadata({
      manual_launch_tracker: {
        persona: { id: 'preset-1', name: 'Solo App Founders', skepticism_level: 'high' },
      },
    })?.name).toBe('Solo App Founders')
  })

  it('builds a compact learning entry from summary signals', () => {
    const entry = buildCampaignPersonaLearning({
      campaignId: 'camp_1',
      metadata: { persona: { id: 'persona-1', name: 'Founder Operator' } },
      summary: summary({
        strongestHook: 'Ship before momentum dies',
        recommendedNext: ['Measure email replies'],
        inputCounts: { metrics: 0, ads: 0, social: 0, email: 0, manualTasks: 2 },
      }),
      timestamp: '2026-06-12T02:00:00.000Z',
    })

    expect(entry?.persona.name).toBe('Founder Operator')
    expect(entry?.insight_signal).toBe('Ship before momentum dies')
    expect(entry?.manual_task_count).toBe(2)
    expect(entry?.recommended_next).toEqual(['Measure email replies'])
  })

  it('merges persona current and bounded history without clobbering existing insights', () => {
    const entry = buildCampaignPersonaLearning({
      campaignId: 'camp_new',
      metadata: { persona: { id: 'persona-1', name: 'Founder Operator' } },
      summary: summary({ recommendedNext: ['Log results'] }),
      timestamp: '2026-06-12T02:00:00.000Z',
    })!
    const merged = mergeCampaignPersonaLearning({
      current: { winning_hooks: ['old'] },
      persona_history: {
        'persona-1': [
          { campaign_id: 'old_1' },
          { campaign_id: 'old_2' },
          { campaign_id: 'old_3' },
          { campaign_id: 'old_4' },
          { campaign_id: 'old_5' },
        ],
      },
    }, entry)

    expect(merged.current).toEqual({ winning_hooks: ['old'] })
    expect((merged.persona_current as Record<string, unknown>)['persona-1']).toEqual(entry)
    const history = (merged.persona_history as Record<string, unknown[]>)['persona-1']
    expect(history.map((item) => (item as { campaign_id: string }).campaign_id)).toEqual(['old_2', 'old_3', 'old_4', 'old_5', 'camp_new'])
  })

  it('uses manual completion as a fallback insight signal', () => {
    expect(personaInsightSignal(summary({
      inputCounts: { metrics: 0, ads: 0, social: 0, email: 0, manualTasks: 1 },
    }))).toBe('1 manual task completed')
  })
})
