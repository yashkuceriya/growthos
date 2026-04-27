// HMAC-SHA256 webhook signing. Format mirrors Stripe's well-known scheme so
// receivers familiar with it can reuse muscle memory:
//
//   X-GrowthOS-Signature: t=<unix-seconds>,v1=<hex-hmac>
//
// The signed material is `${timestamp}.${rawBody}`. Including the timestamp
// closes the replay window — the receiver rejects messages whose timestamp
// is more than SIG_TOLERANCE_SECONDS off wall-clock now.
//
// We use timingSafeEqual on the comparison side so a rogue receiver can't
// learn the signature byte-by-byte.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const SIG_TOLERANCE_SECONDS = 300 // 5 min — same window as Stripe's default

/** Mint a new endpoint signing secret. Prefix marks it as a GrowthOS secret. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`
}

/** Raw HMAC. Exposed for tests; production callers use buildSignatureHeader. */
export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

/**
 * Build the value of the X-GrowthOS-Signature header for a delivery. Caller
 * may pass an explicit timestamp (tests); defaults to wall-clock now.
 */
export function buildSignatureHeader(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const sig = signPayload(secret, timestamp, body)
  return `t=${timestamp},v1=${sig}`
}

export type VerifyFailureReason =
  | 'missing-header'
  | 'malformed-header'
  | 'invalid-timestamp'
  | 'timestamp-out-of-tolerance'
  | 'signature-mismatch'

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailureReason }

/**
 * Verify a signature header against a body. Used by the customer's receiver
 * — we expose this from the public API surface so users don't have to
 * re-derive the algorithm. It also lets us round-trip our own signatures in
 * tests.
 *
 * Pass `now` (unix seconds) explicitly if you want deterministic verification
 * (e.g. tests with frozen clocks).
 */
export function verifySignature(args: {
  secret: string
  body: string
  header: string | null | undefined
  toleranceSeconds?: number
  now?: number
}): VerifyResult {
  if (!args.header) return { ok: false, reason: 'missing-header' }

  const parts = args.header.split(',').map((p) => p.trim()).filter(Boolean)
  const tEntry = parts.find((p) => p.startsWith('t='))
  const vEntry = parts.find((p) => p.startsWith('v1='))
  if (!tEntry || !vEntry) return { ok: false, reason: 'malformed-header' }

  const t = Number(tEntry.slice(2))
  if (!Number.isFinite(t)) return { ok: false, reason: 'invalid-timestamp' }

  const tolerance = args.toleranceSeconds ?? SIG_TOLERANCE_SECONDS
  const nowSec = args.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - t) > tolerance) return { ok: false, reason: 'timestamp-out-of-tolerance' }

  const provided = vEntry.slice(3)
  const expected = signPayload(args.secret, t, args.body)
  if (provided.length !== expected.length) return { ok: false, reason: 'signature-mismatch' }

  // timingSafeEqual requires equal-length buffers (checked above).
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'signature-mismatch' }

  return { ok: true }
}
