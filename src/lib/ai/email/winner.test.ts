import { describe, it, expect } from 'vitest'
import { scoreTemplate, selectTemplateWinners, DEFAULT_WINNER_OPTS, type TemplateStats } from './winner'

function stats(overrides: Partial<TemplateStats> = {}): TemplateStats {
  return {
    template_id: overrides.template_id ?? 't1',
    sends: overrides.sends ?? 0,
    delivered: overrides.delivered ?? 0,
    opens: overrides.opens ?? 0,
    clicks: overrides.clicks ?? 0,
  }
}

describe('scoreTemplate', () => {
  it('returns 0 when no sends', () => {
    expect(scoreTemplate(stats())).toBe(0)
  })

  it('weights clicks more than opens', () => {
    const allOpens = stats({ sends: 100, delivered: 100, opens: 50, clicks: 0 })
    const allClicks = stats({ sends: 100, delivered: 100, opens: 0, clicks: 50 })
    expect(scoreTemplate(allClicks)).toBeGreaterThan(scoreTemplate(allOpens))
  })

  it('uses delivered count as denominator when present', () => {
    // Same opens (10) but different delivered counts → different rates.
    const tight = stats({ sends: 100, delivered: 50, opens: 10, clicks: 0 })
    const loose = stats({ sends: 100, delivered: 100, opens: 10, clicks: 0 })
    expect(scoreTemplate(tight)).toBeGreaterThan(scoreTemplate(loose))
  })

  it('falls back to sends when delivered=0 (webhooks unwired)', () => {
    const s = stats({ sends: 100, delivered: 0, opens: 30, clicks: 5 })
    const score = scoreTemplate(s)
    expect(score).toBeCloseTo(0.3 * 0.30 + 0.7 * 0.05, 4)
  })

  it('clean-room sanity: 100% open + 100% click = max possible score', () => {
    const s = stats({ sends: 50, delivered: 50, opens: 50, clicks: 50 })
    expect(scoreTemplate(s)).toBeCloseTo(1.0, 4)
  })
})

describe('selectTemplateWinners', () => {
  it('respects minSends gate', () => {
    const rows = [
      stats({ template_id: 'tiny', sends: 5, delivered: 5, opens: 5, clicks: 5 }), // perfect rate but tiny sample
      stats({ template_id: 'big', sends: 100, delivered: 100, opens: 30, clicks: 10 }),
    ]
    const { winners } = selectTemplateWinners(rows, new Set())
    expect(winners.map((w) => w.template_id)).toEqual(['big'])
  })

  it('picks topN by score', () => {
    const rows = [
      stats({ template_id: 'a', sends: 100, delivered: 100, opens: 50, clicks: 20 }),
      stats({ template_id: 'b', sends: 100, delivered: 100, opens: 30, clicks: 5 }),
      stats({ template_id: 'c', sends: 100, delivered: 100, opens: 20, clicks: 1 }),
    ]
    const { winners } = selectTemplateWinners(rows, new Set())
    expect(winners.map((w) => w.template_id)).toEqual(['a', 'b'])
  })

  it('demotes previously-flagged templates that no longer qualify', () => {
    const rows = [
      stats({ template_id: 'old', sends: 100, delivered: 100, opens: 5, clicks: 1 }), // ~0.022 score, below floor
      stats({ template_id: 'new', sends: 100, delivered: 100, opens: 50, clicks: 20 }),
    ]
    const { winners, demote } = selectTemplateWinners(rows, new Set(['old']))
    expect(winners.map((w) => w.template_id)).toEqual(['new'])
    expect(demote).toEqual(['old'])
  })

  it('demotes flagged template that has zero recent sends (no data row)', () => {
    // Currently flagged but no stats row in this window → falls out.
    const rows = [stats({ template_id: 'new', sends: 100, delivered: 100, opens: 30, clicks: 10 })]
    const { winners, demote } = selectTemplateWinners(rows, new Set(['stale']))
    expect(winners.map((w) => w.template_id)).toEqual(['new'])
    expect(demote).toEqual(['stale'])
  })

  it('respects custom topN', () => {
    const rows = [
      stats({ template_id: 'a', sends: 100, delivered: 100, opens: 50, clicks: 20 }),
      stats({ template_id: 'b', sends: 100, delivered: 100, opens: 40, clicks: 15 }),
    ]
    const { winners } = selectTemplateWinners(rows, new Set(), { ...DEFAULT_WINNER_OPTS, topN: 1 })
    expect(winners).toHaveLength(1)
  })

  it('filters out templates that meet minSends but score below minScore floor', () => {
    const rows = [stats({ template_id: 'a', sends: 100, delivered: 100, opens: 1, clicks: 0 })]
    const { winners } = selectTemplateWinners(rows, new Set())
    expect(winners).toHaveLength(0)
  })
})
