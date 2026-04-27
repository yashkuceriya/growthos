// Exhaustive SSRF blocklist tests. Each case maps to a real-world attack
// vector that customers paying us will eventually try (intentionally or
// not). Don't relax these without a security review.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateWebhookUrl } from './url-validator'

const PROD = 'production'

describe('validateWebhookUrl — blocks SSRF vectors in production', () => {
  beforeEach(() => { vi.stubEnv('NODE_ENV', PROD) })
  afterEach(() => { vi.unstubAllEnvs() })

  it('blocks AWS / GCP / Azure metadata IP', () => {
    const r = validateWebhookUrl('http://169.254.169.254/latest/meta-data/')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/private|internal|reserved/i)
  })

  it('blocks GCP metadata hostname', () => {
    const r = validateWebhookUrl('http://metadata.google.internal/')
    expect(r.ok).toBe(false)
  })

  it('blocks plain localhost', () => {
    const r = validateWebhookUrl('http://localhost:3000/abuse')
    expect(r.ok).toBe(false)
  })

  it('blocks 127.0.0.1', () => {
    const r = validateWebhookUrl('http://127.0.0.1/abuse')
    expect(r.ok).toBe(false)
  })

  it('blocks any 127.x.x.x (loopback /8)', () => {
    const r = validateWebhookUrl('http://127.1.2.3/x')
    expect(r.ok).toBe(false)
  })

  it('blocks 0.0.0.0', () => {
    const r = validateWebhookUrl('http://0.0.0.0/x')
    expect(r.ok).toBe(false)
  })

  it('blocks 10.x.x.x RFC1918', () => {
    const r = validateWebhookUrl('http://10.0.0.5:5432/postgres')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/private/i)
  })

  it('blocks 172.16-31.x', () => {
    expect(validateWebhookUrl('http://172.16.0.1').ok).toBe(false)
    expect(validateWebhookUrl('http://172.31.255.255').ok).toBe(false)
    // 172.32+ is public; 172.15 is too
    expect(validateWebhookUrl('http://172.15.0.1').ok).toBe(true)
    expect(validateWebhookUrl('http://172.32.0.1').ok).toBe(true)
  })

  it('blocks 192.168.x.x', () => {
    const r = validateWebhookUrl('http://192.168.1.1')
    expect(r.ok).toBe(false)
  })

  it('blocks IPv6 loopback ::1', () => {
    const r = validateWebhookUrl('http://[::1]/abuse')
    expect(r.ok).toBe(false)
  })

  it('blocks IPv6 link-local fe80::', () => {
    const r = validateWebhookUrl('http://[fe80::1]/x')
    expect(r.ok).toBe(false)
  })

  it('blocks IPv6 ULA fc00::/7', () => {
    expect(validateWebhookUrl('http://[fc00::1]/x').ok).toBe(false)
    expect(validateWebhookUrl('http://[fd12:3456::1]/x').ok).toBe(false)
  })

  it('blocks .internal / .local / .corp suffixes', () => {
    expect(validateWebhookUrl('https://api.example.internal/').ok).toBe(false)
    expect(validateWebhookUrl('https://something.local/').ok).toBe(false)
    expect(validateWebhookUrl('https://thing.corp/').ok).toBe(false)
  })

  it('blocks ftp:// / file:// / javascript:', () => {
    expect(validateWebhookUrl('ftp://example.com/').ok).toBe(false)
    expect(validateWebhookUrl('file:///etc/passwd').ok).toBe(false)
    expect(validateWebhookUrl('javascript:alert(1)').ok).toBe(false)
  })

  it('blocks URLs with embedded credentials', () => {
    const r = validateWebhookUrl('https://user:pass@example.com/hook')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/credentials/i)
  })

  it('allows normal public https URLs', () => {
    expect(validateWebhookUrl('https://api.customer.com/webhooks/growthos').ok).toBe(true)
    expect(validateWebhookUrl('https://hooks.zapier.com/hooks/catch/12345/abc/').ok).toBe(true)
  })

  it('allows http for non-private hosts (some on-prem still uses http behind TLS terminator)', () => {
    expect(validateWebhookUrl('http://api.customer.com/webhook').ok).toBe(true)
  })
})

describe('validateWebhookUrl — dev mode allows localhost', () => {
  beforeEach(() => { vi.stubEnv('NODE_ENV', 'development') })
  afterEach(() => { vi.unstubAllEnvs() })

  it('allows localhost in dev', () => {
    expect(validateWebhookUrl('http://localhost:3000/hook').ok).toBe(true)
  })

  it('allows 127.0.0.1 in dev', () => {
    expect(validateWebhookUrl('http://127.0.0.1:8080/hook').ok).toBe(true)
  })

  it('still blocks 169.254.169.254 in dev (cloud metadata is never legit)', () => {
    expect(validateWebhookUrl('http://169.254.169.254/').ok).toBe(false)
  })

  it('still blocks RFC1918 in dev (rarely a real receiver)', () => {
    expect(validateWebhookUrl('http://10.0.0.5/').ok).toBe(false)
  })
})

describe('validateWebhookUrl — explicit dev override', () => {
  it('allowDevHosts=true bypasses localhost block even in production', () => {
    vi.stubEnv('NODE_ENV', PROD)
    const r = validateWebhookUrl('http://localhost:3000/hook', { allowDevHosts: true })
    expect(r.ok).toBe(true)
    vi.unstubAllEnvs()
  })
})
