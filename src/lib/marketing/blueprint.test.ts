import { describe, expect, it } from 'vitest'
import { buildMarketingBlueprint } from './blueprint'

describe('buildMarketingBlueprint', () => {
  it('uses product classification to select a vertical playbook', () => {
    const blueprint = buildMarketingBlueprint({
      name: 'DevTool',
      website: 'https://example.com',
      brand_voice: {
        tagline: 'Ship APIs faster',
        classification: {
          vertical: 'dev_tool',
          vertical_confidence: 0.91,
          ideal_customer_profile: 'Backend engineers at small SaaS teams.',
          primary_goal: 'signups',
        },
        captured_screenshot: { url: 'https://example.com/shot.png' },
      },
    })

    expect(blueprint.vertical).toBe('dev_tool')
    expect(blueprint.primaryChannels).toContain('github')
    expect(blueprint.primaryKpi).toMatch(/installs/i)
    expect(blueprint.readiness.every((r) => r.ready)).toBe(true)
  })

  it('falls back to the generic playbook without classification', () => {
    const blueprint = buildMarketingBlueprint({
      name: 'Unknown',
      website: null,
      brand_voice: {},
    })

    expect(blueprint.vertical).toBe('other')
    expect(blueprint.primaryChannels.length).toBeGreaterThan(0)
    expect(blueprint.readiness.some((r) => !r.ready)).toBe(true)
  })
})
