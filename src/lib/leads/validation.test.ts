import { describe, it, expect } from 'vitest'
import { normalizeLeadInput } from './validation'

describe('normalizeLeadInput', () => {
  it('normalizes valid lead input', () => {
    const result = normalizeLeadInput({
      projectId: '123e4567-e89b-42d3-a456-426614174000',
      email: '  Founder@Example.com ',
      name: '  Yash  ',
      source: 'landing_page',
      metadata: { plan: 'pro' },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.email).toBe('founder@example.com')
    expect(result.data.name).toBe('Yash')
    expect(result.data.metadata).toEqual({ plan: 'pro' })
  })

  it('rejects invalid project ids', () => {
    const result = normalizeLeadInput({
      projectId: 'not-a-uuid',
      email: 'founder@example.com',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/projectId/i)
  })

  it('rejects non-object metadata', () => {
    const result = normalizeLeadInput({
      projectId: '123e4567-e89b-42d3-a456-426614174000',
      email: 'founder@example.com',
      metadata: 'oops',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/metadata/i)
  })

  it('rejects oversized metadata payloads', () => {
    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 80 }, (_, i) => [`k${i}`, 'value']),
    )
    const result = normalizeLeadInput({
      projectId: '123e4567-e89b-42d3-a456-426614174000',
      email: 'founder@example.com',
      metadata: tooManyKeys,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/metadata/i)
  })
})
