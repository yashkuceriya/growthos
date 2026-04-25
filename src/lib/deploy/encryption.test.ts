import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'crypto'
import { encryptToken, decryptToken } from './encryption'

beforeAll(() => {
  process.env.SOCIAL_TOKEN_ENC_KEY = randomBytes(32).toString('base64')
})

describe('token encryption', () => {
  it('round-trips a string', () => {
    const plain = 'oauth2-access-token-' + Math.random()
    const enc = encryptToken(plain)
    expect(enc).not.toContain(plain)
    expect(decryptToken(enc)).toBe(plain)
  })

  it('produces a different ciphertext each time (fresh IV)', () => {
    const a = encryptToken('same input')
    const b = encryptToken('same input')
    expect(a).not.toBe(b)
    expect(decryptToken(a)).toBe('same input')
    expect(decryptToken(b)).toBe('same input')
  })

  it('rejects tampered ciphertext (auth tag mismatch)', () => {
    const enc = encryptToken('payload')
    const buf = Buffer.from(enc, 'base64')
    buf[buf.length - 1] ^= 0xff // flip a bit in the ciphertext
    const tampered = buf.toString('base64')
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('throws if key is missing', () => {
    const saved = process.env.SOCIAL_TOKEN_ENC_KEY
    delete process.env.SOCIAL_TOKEN_ENC_KEY
    try {
      expect(() => encryptToken('x')).toThrow(/SOCIAL_TOKEN_ENC_KEY/)
    } finally {
      process.env.SOCIAL_TOKEN_ENC_KEY = saved
    }
  })

  it('rejects keys that do not decode to 32 bytes', () => {
    const saved = process.env.SOCIAL_TOKEN_ENC_KEY
    process.env.SOCIAL_TOKEN_ENC_KEY = Buffer.from('too-short').toString('base64')
    try {
      expect(() => encryptToken('x')).toThrow(/32 bytes/)
    } finally {
      process.env.SOCIAL_TOKEN_ENC_KEY = saved
    }
  })
})
