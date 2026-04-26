import { describe, it, expect } from 'vitest'
import { VIDEO_MODELS, getModel, defaultModel } from './models'

describe('VIDEO_MODELS', () => {
  it('has unique ids', () => {
    const ids = VIDEO_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every model points at a known provider', () => {
    const providers = new Set(['fal', 'openai', 'xai'])
    for (const m of VIDEO_MODELS) {
      expect(providers.has(m.provider)).toBe(true)
    }
  })

  it('exactly one model is marked default', () => {
    const defaults = VIDEO_MODELS.filter((m) => m.default)
    expect(defaults).toHaveLength(1)
  })

  it('every model has a positive cost and max_seconds', () => {
    for (const m of VIDEO_MODELS) {
      expect(m.cost_usd_per_clip).toBeGreaterThan(0)
      expect(m.max_seconds).toBeGreaterThan(0)
    }
  })
})

describe('getModel / defaultModel', () => {
  it('getModel returns the matching row', () => {
    expect(getModel('kling-2')?.provider).toBe('fal')
  })

  it('getModel returns null for unknown id', () => {
    expect(getModel('not-a-model')).toBeNull()
  })

  it('defaultModel returns the model flagged default', () => {
    const d = defaultModel()
    expect(d.default).toBe(true)
    expect(d.id).toBe('kling-2')
  })
})
