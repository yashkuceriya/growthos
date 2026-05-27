import { describe, expect, it } from 'vitest'
import { deriveMetrics, aggregateRows, rollupByChannel, formatPct, formatMoney, formatNumber } from './derive'

describe('deriveMetrics', () => {
  it('returns null for divisions by zero', () => {
    expect(deriveMetrics({ impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 })).toEqual({
      ctr: null, conversion_rate: null, cpc: null, cpl: null, roas: null,
    })
  })

  it('computes ratios when denominators are non-zero', () => {
    const d = deriveMetrics({ impressions: 1000, clicks: 50, conversions: 5, spend: 100, revenue: 250 })
    expect(d.ctr).toBeCloseTo(0.05)
    expect(d.conversion_rate).toBeCloseTo(0.1)
    expect(d.cpc).toBeCloseTo(2)
    expect(d.cpl).toBeCloseTo(20)
    expect(d.roas).toBeCloseTo(2.5)
  })
})

describe('aggregateRows', () => {
  it('sums rows and re-derives metrics on the totals', () => {
    const agg = aggregateRows([
      { impressions: 500, clicks: 25, conversions: 2, spend: 50, revenue: 80 },
      { impressions: 500, clicks: 25, conversions: 3, spend: 50, revenue: 170 },
    ])
    expect(agg.impressions).toBe(1000)
    expect(agg.clicks).toBe(50)
    expect(agg.conversions).toBe(5)
    expect(agg.roas).toBeCloseTo(2.5)
  })

  it('handles an empty array', () => {
    expect(aggregateRows([])).toMatchObject({ impressions: 0, ctr: null })
  })
})

describe('rollupByChannel', () => {
  it('groups rows by channel and sorts by spend desc', () => {
    const rolled = rollupByChannel([
      { channel: 'meta', impressions: 100, clicks: 5, conversions: 1, spend: 20, revenue: 40 },
      { channel: 'meta', impressions: 200, clicks: 10, conversions: 2, spend: 30, revenue: 90 },
      { channel: 'linkedin', impressions: 500, clicks: 50, conversions: 4, spend: 100, revenue: 300 },
    ])
    expect(rolled).toHaveLength(2)
    expect(rolled[0].channel).toBe('linkedin')
    expect(rolled[0].spend).toBe(100)
    expect(rolled[1].channel).toBe('meta')
    expect(rolled[1].spend).toBe(50)
    expect(rolled[1].days).toBe(2)
  })
})

describe('formatters', () => {
  it('formats percentages and currency safely', () => {
    expect(formatPct(0.0532)).toBe('5.32%')
    expect(formatPct(null)).toBe('—')
    expect(formatMoney(12.345)).toBe('$12.35')
    expect(formatMoney(null)).toBe('—')
    expect(formatNumber(1_500_000)).toBe('1.5M')
    expect(formatNumber(2500)).toBe('2.5K')
    expect(formatNumber(42)).toBe('42')
  })
})
