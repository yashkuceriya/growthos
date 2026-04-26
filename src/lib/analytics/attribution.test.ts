import { describe, it, expect } from 'vitest'
import {
  rollupBySource,
  rollupByMedium,
  rollupByCampaign,
  rollupBySourceMedium,
  summarize,
  type LeadRow,
} from './attribution'

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'l_' + Math.random().toString(36).slice(2, 8),
    source: null,
    campaign_id: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    status: 'new',
    created_at: new Date().toISOString(),
    converted_at: null,
    ...overrides,
  }
}

describe('rollupBySource', () => {
  it('prefers utm_source over the free-text source field', () => {
    const leads = [
      lead({ utm_source: 'google', source: 'web' }),
      lead({ utm_source: 'twitter', source: 'web' }),
    ]
    const r = rollupBySource(leads)
    expect(r.map((b) => b.display).sort()).toEqual(['google', 'twitter'])
  })

  it('falls back to source when utm_source is missing', () => {
    const r = rollupBySource([lead({ source: 'newsletter' })])
    expect(r[0]?.display).toBe('newsletter')
  })

  it('groups everything else under (direct)', () => {
    const r = rollupBySource([lead(), lead()])
    expect(r).toHaveLength(1)
    expect(r[0]?.display).toBe('(direct)')
    expect(r[0]?.leads).toBe(2)
  })

  it('counts converted leads correctly', () => {
    const leads = [
      lead({ utm_source: 'google', status: 'converted' }),
      lead({ utm_source: 'google', status: 'new' }),
      lead({ utm_source: 'google', status: 'converted' }),
    ]
    const r = rollupBySource(leads)
    expect(r[0]?.leads).toBe(3)
    expect(r[0]?.converted).toBe(2)
    expect(r[0]?.conversion_rate).toBeCloseTo(2 / 3, 4)
  })

  it('sorts buckets by lead count descending', () => {
    const leads = [
      ...Array(2).fill(0).map(() => lead({ utm_source: 'a' })),
      ...Array(5).fill(0).map(() => lead({ utm_source: 'b' })),
      ...Array(3).fill(0).map(() => lead({ utm_source: 'c' })),
    ]
    const r = rollupBySource(leads)
    expect(r.map((b) => b.display)).toEqual(['b', 'c', 'a'])
  })
})

describe('rollupByMedium', () => {
  it('uses (none) when utm_medium is missing', () => {
    const r = rollupByMedium([lead({ utm_medium: 'cpc' }), lead({ utm_medium: null })])
    expect(r.find((b) => b.display === '(none)')?.leads).toBe(1)
    expect(r.find((b) => b.display === 'cpc')?.leads).toBe(1)
  })
})

describe('rollupByCampaign', () => {
  it('groups by campaign_id and resolves names from the lookup map', () => {
    const names = new Map([['c1', 'Spring Launch'], ['c2', 'Summer Promo']])
    const leads = [
      lead({ campaign_id: 'c1' }), lead({ campaign_id: 'c1', status: 'converted' }),
      lead({ campaign_id: 'c2' }),
      lead({ campaign_id: null }),
    ]
    const r = rollupByCampaign(leads, names)
    expect(r.find((b) => b.campaign_id === 'c1')?.display).toBe('Spring Launch')
    expect(r.find((b) => b.campaign_id === 'c2')?.display).toBe('Summer Promo')
    expect(r.find((b) => b.campaign_id === null)?.display).toBe('(unattributed)')
  })

  it('falls back to a short id label when name is missing from the map', () => {
    const r = rollupByCampaign([lead({ campaign_id: 'abcdef1234567890' })], new Map())
    expect(r[0]?.display).toMatch(/Campaign abcdef12/)
  })
})

describe('rollupBySourceMedium', () => {
  it('produces source / medium combos', () => {
    const leads = [
      lead({ utm_source: 'newsletter', utm_medium: 'cta_button' }),
      lead({ utm_source: 'newsletter', utm_medium: 'cta_button' }),
      lead({ utm_source: 'newsletter', utm_medium: 'footer_link' }),
    ]
    const r = rollupBySourceMedium(leads)
    expect(r[0]?.display).toBe('newsletter / cta_button')
    expect(r[0]?.leads).toBe(2)
    expect(r[1]?.display).toBe('newsletter / footer_link')
  })
})

describe('summarize', () => {
  it('counts attributed and converted', () => {
    const leads = [
      lead({ utm_source: 'google', status: 'converted' }),
      lead({ campaign_id: 'c1' }),
      lead(), // unattributed, not converted
    ]
    const s = summarize(leads)
    expect(s.total_leads).toBe(3)
    expect(s.total_converted).toBe(1)
    expect(s.attributed_leads).toBe(2)
    expect(s.attribution_coverage).toBeCloseTo(2 / 3, 4)
  })

  it('handles empty input cleanly', () => {
    const s = summarize([])
    expect(s.total_leads).toBe(0)
    expect(s.conversion_rate).toBe(0)
    expect(s.attribution_coverage).toBe(0)
  })
})
