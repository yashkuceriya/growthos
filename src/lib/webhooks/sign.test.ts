import { describe, it, expect } from 'vitest'
import {
  signPayload,
  buildSignatureHeader,
  verifySignature,
  generateWebhookSecret,
  SIG_TOLERANCE_SECONDS,
} from './sign'

const SECRET = 'whsec_test_secret_123'
const BODY = JSON.stringify({ event: 'ingest.completed', project_id: 'p1' })
const FROZEN_NOW = 1_700_000_000

describe('signPayload', () => {
  it('is deterministic for the same inputs', () => {
    const a = signPayload(SECRET, FROZEN_NOW, BODY)
    const b = signPayload(SECRET, FROZEN_NOW, BODY)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/) // sha256 hex = 64 chars
  })

  it('changes when the body changes', () => {
    const a = signPayload(SECRET, FROZEN_NOW, BODY)
    const b = signPayload(SECRET, FROZEN_NOW, BODY + ' ')
    expect(a).not.toBe(b)
  })

  it('changes when the timestamp changes', () => {
    const a = signPayload(SECRET, FROZEN_NOW, BODY)
    const b = signPayload(SECRET, FROZEN_NOW + 1, BODY)
    expect(a).not.toBe(b)
  })

  it('changes when the secret changes', () => {
    const a = signPayload(SECRET, FROZEN_NOW, BODY)
    const b = signPayload(SECRET + 'x', FROZEN_NOW, BODY)
    expect(a).not.toBe(b)
  })
})

describe('buildSignatureHeader', () => {
  it('emits t=...,v1=... format', () => {
    const header = buildSignatureHeader(SECRET, BODY, FROZEN_NOW)
    expect(header).toBe(`t=${FROZEN_NOW},v1=${signPayload(SECRET, FROZEN_NOW, BODY)}`)
  })

  it('round-trips through verifySignature', () => {
    const header = buildSignatureHeader(SECRET, BODY, FROZEN_NOW)
    const result = verifySignature({ secret: SECRET, body: BODY, header, now: FROZEN_NOW })
    expect(result.ok).toBe(true)
  })
})

describe('verifySignature', () => {
  it('rejects missing header', () => {
    const r = verifySignature({ secret: SECRET, body: BODY, header: null })
    expect(r).toEqual({ ok: false, reason: 'missing-header' })
  })

  it('rejects malformed header (no t=)', () => {
    const r = verifySignature({ secret: SECRET, body: BODY, header: 'v1=abc', now: FROZEN_NOW })
    expect(r).toEqual({ ok: false, reason: 'malformed-header' })
  })

  it('rejects malformed header (no v1=)', () => {
    const r = verifySignature({ secret: SECRET, body: BODY, header: `t=${FROZEN_NOW}`, now: FROZEN_NOW })
    expect(r).toEqual({ ok: false, reason: 'malformed-header' })
  })

  it('rejects non-numeric timestamp', () => {
    const r = verifySignature({ secret: SECRET, body: BODY, header: 't=abc,v1=zzz', now: FROZEN_NOW })
    expect(r).toEqual({ ok: false, reason: 'invalid-timestamp' })
  })

  it('rejects timestamp older than tolerance (replay)', () => {
    const old = FROZEN_NOW - SIG_TOLERANCE_SECONDS - 1
    const header = buildSignatureHeader(SECRET, BODY, old)
    const r = verifySignature({ secret: SECRET, body: BODY, header, now: FROZEN_NOW })
    expect(r).toEqual({ ok: false, reason: 'timestamp-out-of-tolerance' })
  })

  it('rejects timestamp newer than tolerance (clock skew)', () => {
    const future = FROZEN_NOW + SIG_TOLERANCE_SECONDS + 1
    const header = buildSignatureHeader(SECRET, BODY, future)
    const r = verifySignature({ secret: SECRET, body: BODY, header, now: FROZEN_NOW })
    expect(r).toEqual({ ok: false, reason: 'timestamp-out-of-tolerance' })
  })

  it('accepts edge timestamps within tolerance', () => {
    const edge = FROZEN_NOW - SIG_TOLERANCE_SECONDS
    const header = buildSignatureHeader(SECRET, BODY, edge)
    const r = verifySignature({ secret: SECRET, body: BODY, header, now: FROZEN_NOW })
    expect(r.ok).toBe(true)
  })

  it('rejects when body has been tampered with', () => {
    const header = buildSignatureHeader(SECRET, BODY, FROZEN_NOW)
    const r = verifySignature({ secret: SECRET, body: BODY + 'x', header, now: FROZEN_NOW })
    expect(r).toEqual({ ok: false, reason: 'signature-mismatch' })
  })

  it('rejects when secret is wrong', () => {
    const header = buildSignatureHeader(SECRET, BODY, FROZEN_NOW)
    const r = verifySignature({ secret: SECRET + 'x', body: BODY, header, now: FROZEN_NOW })
    expect(r).toEqual({ ok: false, reason: 'signature-mismatch' })
  })

  it('rejects signature of wrong length without throwing', () => {
    const header = `t=${FROZEN_NOW},v1=tooshort`
    const r = verifySignature({ secret: SECRET, body: BODY, header, now: FROZEN_NOW })
    expect(r).toEqual({ ok: false, reason: 'signature-mismatch' })
  })
})

describe('generateWebhookSecret', () => {
  it('emits a whsec_-prefixed unique value', () => {
    const a = generateWebhookSecret()
    const b = generateWebhookSecret()
    expect(a).toMatch(/^whsec_[A-Za-z0-9_-]+$/)
    expect(b).toMatch(/^whsec_[A-Za-z0-9_-]+$/)
    expect(a).not.toBe(b)
  })
})
