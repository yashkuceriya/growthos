import { describe, expect, it } from 'vitest'
import { learningSummaryToPrompt, summarizeCampaign, type LearningSummaryInputs } from './learning'

function baseInputs(overrides: Partial<LearningSummaryInputs> = {}): LearningSummaryInputs {
  return {
    metrics: [],
    ads: [],
    social: [],
    email: [],
    insights: { current: null },
    ...overrides,
  }
}

describe('summarizeCampaign', () => {
  it('returns a clean empty summary when no data is provided', () => {
    const s = summarizeCampaign(baseInputs())
    expect(s.bestChannel).toBeNull()
    expect(s.worstChannel).toBeNull()
    expect(s.bestAsset).toBeNull()
    expect(s.strongestHook).toBeNull()
    expect(s.recommendedNext).toEqual([])
    expect(s.inputCounts).toEqual({ metrics: 0, ads: 0, social: 0, email: 0 })
  })

  it('picks the channel with the highest ROAS as best', () => {
    const s = summarizeCampaign(baseInputs({
      metrics: [
        { channel: 'meta', date: '2026-01-01', impressions: 1000, clicks: 100, conversions: 10, spend: 100, revenue: 500 },
        { channel: 'linkedin', date: '2026-01-01', impressions: 1000, clicks: 50, conversions: 5, spend: 100, revenue: 200 },
      ],
    }))
    expect(s.bestChannel?.channel).toBe('meta')
    expect(s.bestChannel?.reason).toMatch(/ROAS/i)
  })

  it('flags a wasted-spend channel as worst even when ROAS is missing', () => {
    const s = summarizeCampaign(baseInputs({
      metrics: [
        { channel: 'meta', date: '2026-01-01', impressions: 1000, clicks: 100, conversions: 10, spend: 100, revenue: 500 },
        { channel: 'twitter', date: '2026-01-01', impressions: 5000, clicks: 50, conversions: 0, spend: 80, revenue: 0 },
      ],
    }))
    expect(s.worstChannel?.channel).toBe('twitter')
    expect(s.worstChannel?.reason).toMatch(/no conversions/i)
  })

  it('does not pick the same channel as both best and worst', () => {
    const s = summarizeCampaign(baseInputs({
      metrics: [
        { channel: 'meta', date: '2026-01-01', impressions: 1000, clicks: 100, conversions: 10, spend: 100, revenue: 500 },
      ],
    }))
    expect(s.bestChannel?.channel).toBe('meta')
    expect(s.worstChannel).toBeNull()
  })

  it('picks a human-approved ad as the best asset', () => {
    const s = summarizeCampaign(baseInputs({
      ads: [
        { id: 'a1', status: 'human_approved', weighted_average: 8.5, headline: 'Stop spreadsheet hell', primary_text: 'Save 5h/week', is_best: true },
        { id: 'a2', status: 'evaluator_pass', weighted_average: 9.0, headline: 'Better ROI', primary_text: 'Higher score, lower status', is_best: false },
      ],
    }))
    expect(s.bestAsset?.kind).toBe('ad')
    expect(s.bestAsset?.id).toBe('a1')
  })

  it('prefers a flagged winner social post over un-flagged ones with higher raw engagement', () => {
    const s = summarizeCampaign(baseInputs({
      social: [
        { id: 's1', platform: 'twitter', content: 'winner!', is_winner: true, engagement: { likes: 10, replies: 1, shares: 0 } },
        { id: 's2', platform: 'linkedin', content: 'unflagged', is_winner: false, engagement: { likes: 100, replies: 10, shares: 5 } },
      ],
    }))
    expect(s.bestAsset?.kind).toBe('social')
    expect(s.bestAsset?.id).toBe('s1')
  })

  it('falls back to top-scoring ad headline for the strongest hook when no insights are present', () => {
    const s = summarizeCampaign(baseInputs({
      ads: [
        { id: 'a1', status: 'evaluator_pass', weighted_average: 7.5, headline: 'Save 5 hours a week', primary_text: 'x', is_best: false },
        { id: 'a2', status: 'evaluator_pass', weighted_average: 9.0, headline: 'Cut tool costs by half', primary_text: 'y', is_best: false },
      ],
    }))
    expect(s.strongestHook).toBe('Cut tool costs by half')
  })

  it('uses winning_hooks from prior insights when available', () => {
    const s = summarizeCampaign(baseInputs({
      insights: { current: { winning_hooks: ['Founder-built. No tracking.'] } },
      ads: [{ id: 'a1', status: 'evaluator_pass', weighted_average: 9, headline: 'A different headline', primary_text: 'x', is_best: false }],
    }))
    expect(s.strongestHook).toBe('Founder-built. No tracking.')
  })

  it('recommends doubling down on the winning channel and cutting the wasted one', () => {
    const s = summarizeCampaign(baseInputs({
      metrics: [
        { channel: 'meta', date: '2026-01-01', impressions: 1000, clicks: 100, conversions: 10, spend: 100, revenue: 500 },
        { channel: 'twitter', date: '2026-01-01', impressions: 1000, clicks: 50, conversions: 0, spend: 80, revenue: 0 },
      ],
    }))
    const recs = s.recommendedNext.join(' | ')
    expect(recs).toMatch(/double down on meta/i)
    expect(recs).toMatch(/cut or rework twitter/i)
  })

  it('appends a winners-not-promoted nudge when social/email exist but none are flagged', () => {
    const s = summarizeCampaign(baseInputs({
      social: [
        { id: 's1', platform: 'twitter', content: 'no flag', is_winner: false, engagement: { likes: 10 } },
      ],
    }))
    expect(s.recommendedNext.some((r) => /promote a winning/i.test(r))).toBe(true)
  })

  it('learningSummaryToPrompt returns null for bad input', () => {
    expect(learningSummaryToPrompt(null)).toBeNull()
    expect(learningSummaryToPrompt({})).toBeNull()
    expect(learningSummaryToPrompt([])).toBeNull()
  })

  it('learningSummaryToPrompt renders all sections when present', () => {
    const text = learningSummaryToPrompt({
      bestChannel: { channel: 'meta', reason: 'high roas', metrics: { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0, ctr: null, conversion_rate: null, cpc: null, cpl: null, roas: null } },
      worstChannel: { channel: 'twitter', reason: 'zero convs', metrics: { impressions: 0, clicks: 0, conversions: 0, spend: 50, revenue: 0, ctr: null, conversion_rate: null, cpc: null, cpl: null, roas: null } },
      strongestHook: 'Save 5h/week',
      bestAsset: { kind: 'ad', id: 'x', label: 'Winning headline', detail: 'd', score: 9 },
      recommendedNext: ['Try LinkedIn', 'Cut twitter spend'],
      reusableStyleNotes: ['Tone: direct'],
    })
    expect(text).toContain('Best channel: meta')
    expect(text).toContain('Underperforming channel: twitter')
    expect(text).toContain('Save 5h/week')
    expect(text).toContain('Try LinkedIn')
    expect(text).toContain('Tone: direct')
  })

  it('counts inputs accurately', () => {
    const s = summarizeCampaign({
      metrics: [
        { channel: 'meta', date: '2026-01-01', impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 },
      ],
      ads: [
        { id: 'a1', status: 'evaluator_pass', weighted_average: 7, headline: 'x', primary_text: 'y', is_best: false },
        { id: 'a2', status: 'iterating', weighted_average: null, headline: null, primary_text: null, is_best: false },
      ],
      social: [{ id: 's1', platform: 'x', content: 'y', is_winner: false, engagement: null }],
      email: [],
      insights: { current: null },
    })
    expect(s.inputCounts).toEqual({ metrics: 1, ads: 2, social: 1, email: 0 })
  })
})
