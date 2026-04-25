// AES-256-GCM at-rest encryption for OAuth access tokens stored in
// social_accounts.access_token_encrypted. We store the IV + auth tag inline
// so a single column round-trips. The key comes from SOCIAL_TOKEN_ENC_KEY,
// which must be 32 bytes (base64 or 64-char hex). If unset, the helpers throw
// on encrypt — they never silently fall back to plaintext.
//
// Wire format (base64-encoded):  [12-byte iv][16-byte auth tag][ciphertext]

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function loadKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENC_KEY
  if (!raw) throw new Error('SOCIAL_TOKEN_ENC_KEY not set')
  // Accept either 64-char hex or base64 of 32 bytes
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error(`SOCIAL_TOKEN_ENC_KEY must decode to 32 bytes, got ${buf.length}`)
  }
  return buf
}

export function encryptToken(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptToken(payload: string): string {
  const key = loadKey()
  const buf = Buffer.from(payload, 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('Encrypted token too short')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}
