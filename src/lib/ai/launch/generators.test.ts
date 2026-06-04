import { describe, expect, it } from 'vitest'
import { launchPersonaBlock, type LaunchContext } from './generators'

const baseCtx: LaunchContext = {
  productName: 'GrowthOS',
  tagline: 'Marketing command center',
  valueProp: 'Launch apps faster',
  audience: 'founders',
  features: ['quality review'],
  differentiators: ['persona-aware agents'],
  pricing: 'local',
  tone: 'direct',
  primaryColor: '#10b981',
  heroImageUrl: null,
  website: null,
}

describe('launch persona context', () => {
  it('renders primary persona guidance for launch agents', () => {
    const block = launchPersonaBlock({
      ...baseCtx,
      primaryPersona: {
        id: 'persona-1',
        projectId: 'p1',
        name: 'Founder Operator',
        role: 'Founder',
        description: 'Runs launches personally.',
        painPoints: ['launches lose momentum'],
        objections: ['sounds generic'],
        buyingTriggers: ['new app launch'],
        desiredOutcomes: ['ship campaigns faster'],
        vocabulary: ['launch', 'ship', 'sprint'],
        preferredChannels: ['landing'],
        skepticismLevel: 'high',
        isPrimary: true,
      },
    })

    expect(block).toContain('PRIMARY PERSONA: Founder Operator')
    expect(block).toContain('Persona pains: launches lose momentum')
    expect(block).toContain('avoid hype')
  })

  it('returns an empty block when no persona is present', () => {
    expect(launchPersonaBlock(baseCtx)).toBe('')
  })
})
