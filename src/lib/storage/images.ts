// Upload generated ad images to Supabase Storage so we don't bloat ad_copies
// rows with 200KB base64 strings. Returns a public URL on success.
//
// Bucket name comes from IMAGE_STORAGE_BUCKET (default 'ad-images'). On any
// failure (missing bucket, auth issue, network) we fall back to returning
// the original data URL so the ad still has *something* — the row just keeps
// the bloat in that case rather than losing the image entirely. Errors are
// logged so misconfiguration surfaces in dev.

import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_BUCKET = 'ad-images'

function bucket(): string {
  return process.env.IMAGE_STORAGE_BUCKET || DEFAULT_BUCKET
}

/** Decode `data:image/png;base64,...` into a Buffer + mime. */
export function decodeDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  const mime = m[1]!
  const buffer = Buffer.from(m[2]!, 'base64')
  return { buffer, mime }
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'png'
}

export interface UploadAdImageArgs {
  supabase: SupabaseClient
  userId: string
  adCopyId: string
  aspect: string
  /** Either a data URL (we decode) or an https URL we fetch first. */
  source: string
  /** Optional sequence index when uploading multiple aspects at once. */
  index?: number
}

/**
 * Persist a generated image. Returns the public URL on success, or the
 * original `source` string as fallback so the caller never ends up with
 * nothing.
 */
export async function uploadAdImage(args: UploadAdImageArgs): Promise<string> {
  let buffer: Buffer
  let mime: string

  if (args.source.startsWith('data:')) {
    const decoded = decodeDataUrl(args.source)
    if (!decoded) {
      console.error('[storage/images] Could not decode data URL')
      return args.source
    }
    buffer = decoded.buffer
    mime = decoded.mime
  } else {
    try {
      const res = await fetch(args.source)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      buffer = Buffer.from(await res.arrayBuffer())
      mime = res.headers.get('content-type') ?? 'image/png'
    } catch (err) {
      console.error('[storage/images] Source fetch failed:', err)
      return args.source
    }
  }

  const ext = extFromMime(mime)
  const safeAspect = args.aspect.replace(/[^a-z0-9]/gi, '_')
  const path = `${args.userId}/${args.adCopyId}/${Date.now()}-${safeAspect}-${args.index ?? 0}.${ext}`

  try {
    const { error: uploadErr } = await args.supabase.storage
      .from(bucket())
      .upload(path, buffer, { contentType: mime, upsert: true })
    if (uploadErr) throw new Error(uploadErr.message)

    const { data } = args.supabase.storage.from(bucket()).getPublicUrl(path)
    if (!data?.publicUrl) throw new Error('No public URL returned')
    return data.publicUrl
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/bucket not found|does not exist|404/i.test(msg)) {
      console.error(
        `[storage/images] Bucket "${bucket()}" missing — create it in Supabase Storage (or set IMAGE_STORAGE_BUCKET to an existing bucket). Falling back to data URL — ad_copies.media_urls will hold ~200KB base64 strings until fixed.`,
      )
    } else {
      console.error(`[storage/images] Upload to bucket "${bucket()}" failed — falling back to data URL. Error:`, msg)
    }
    return args.source
  }
}
