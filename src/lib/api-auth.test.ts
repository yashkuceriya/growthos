import { describe, it, expect } from 'vitest'
import { generateApiKey, hashKey } from './api-auth'

describe('generateApiKey', () => {
  it('produces a key with the gos_live_ prefix', () => {
    const k = generateApiKey()
    expect(k.plaintext.startsWith('gos_live_')).toBe(true)
  })

  it('returns a prefix of length 17 (gos_live_ + 8 chars)', () => {
    const k = generateApiKey()
    expect(k.prefix.length).toBe(17)
    expect(k.prefix.startsWith('gos_live_')).toBe(true)
  })

  it('hash matches SHA-256 of plaintext', () => {
    const k = generateApiKey()
    expect(k.hash).toBe(hashKey(k.plaintext))
  })

  it('produces distinct keys on each call (high entropy)', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.plaintext).not.toBe(b.plaintext)
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('hashKey', () => {
  it('is deterministic', () => {
    expect(hashKey('abc')).toBe(hashKey('abc'))
  })

  it('produces 64 hex chars (256-bit SHA)', () => {
    expect(hashKey('whatever')).toMatch(/^[a-f0-9]{64}$/)
  })
})
