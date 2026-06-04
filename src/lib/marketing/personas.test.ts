import { describe, expect, it } from 'vitest'
import type { MarketingMemory } from './memory'
import { inferPersonasFromMemory, scorePersonaFit } from './personas'

const memory = {
  project: { id: 'p1', name: 'GrowthOS', website: null, description: null },
  brand: {
    audience: 'solo app founders',
  },
  classification: {
    icp: 'builders launching multiple apps',
    targetMarket: 'founders',
  },
} as unknown as MarketingMemory

describe('persona intelligence', () => {
  it('infers personas from project memory', () => {
    const personas = inferPersonasFromMemory(memory)

    expect(personas.length).toBeGreaterThanOrEqual(3)
    expect(personas[0].name).toBe('Solo App Founders')
    expect(personas[0].vocabulary).toContain('founders')
  })

  it('scores copy higher when it speaks to persona pains and outcomes', () => {
    const [persona] = inferPersonasFromMemory(memory)

    const strong = scorePersonaFit(
      'Solo founders can ship the next launch sprint, track leads, and fix conversion gaps from one local workflow.',
      persona,
    )
    const weak = scorePersonaFit('A powerful innovative platform for everyone.', persona)

    expect(strong.score).toBeGreaterThan(weak.score)
    expect(strong.hits).toContain('launch')
    expect(weak.misses).toContain('desired outcome')
  })
})
