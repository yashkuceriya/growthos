import { describe, expect, it } from 'vitest'
import type { MarketingMemory } from './memory'
import { getPrimaryPersona, inferPersonasFromMemory, personaPrompt, scorePersonaFit } from './personas'

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

  it('uses a stored primary persona when available', async () => {
    const persona = await getPrimaryPersona({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'persona-1',
                  project_id: 'p1',
                  name: 'Technical Founder',
                  role: 'Founder',
                  skepticism_level: 'high',
                  is_primary: true,
                  pain_points: ['manual launches'],
                  objections: ['too much setup'],
                  buying_triggers: [],
                  desired_outcomes: ['ship faster'],
                  vocabulary: ['launch', 'ship'],
                  preferred_channels: ['landing'],
                },
              }),
            }),
          }),
        }),
      }),
    }, 'p1', memory)

    expect(persona?.name).toBe('Technical Founder')
    expect(personaPrompt(persona)).toContain('Persona objections: too much setup')
  })

  it('falls back to inferred primary persona when the table is unavailable', async () => {
    const persona = await getPrimaryPersona({
      from: () => {
        throw new Error('missing table')
      },
    }, 'p1', memory)

    expect(persona?.id).toBe('preset-1')
    expect(persona?.name).toBe('Solo App Founders')
  })
})
