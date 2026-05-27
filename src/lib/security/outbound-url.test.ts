import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateOutboundHttpUrl } from './outbound-url'

describe('validateOutboundHttpUrl', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows normal public https URLs', () => {
    const result = validateOutboundHttpUrl('https://example.com/pricing')
    expect(result.ok).toBe(true)
  })

  it('blocks cloud metadata hosts', () => {
    const result = validateOutboundHttpUrl('http://169.254.169.254/latest/meta-data')
    expect(result.ok).toBe(false)
  })

  it('blocks localhost in production', () => {
    const result = validateOutboundHttpUrl('http://localhost:3000')
    expect(result.ok).toBe(false)
  })

  it('blocks private RFC1918 ranges', () => {
    const result = validateOutboundHttpUrl('http://10.0.0.5/admin')
    expect(result.ok).toBe(false)
  })

  it('blocks non-http protocols', () => {
    const result = validateOutboundHttpUrl('file:///etc/passwd')
    expect(result.ok).toBe(false)
  })
})

describe('validateOutboundHttpUrl in development', () => {
  it('allows loopback urls in development for local testing', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const result = validateOutboundHttpUrl('http://localhost:3000/')
    expect(result.ok).toBe(true)
    vi.unstubAllEnvs()
  })
})
