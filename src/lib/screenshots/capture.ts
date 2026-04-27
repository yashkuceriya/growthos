// Fresh-rendered screenshot capture for project URLs. The page-HTML extract
// in lib/ai/intelligence/ingest.ts already pulls images that the marketing
// site already exposes — but those are curated, sometimes outdated, and
// don't reflect the current rendered DOM. This captures a real browser
// screenshot we can feed into ad-image generation as visual ground truth.
//
// Provider model — kept simple on purpose:
//   - One concrete provider: ScreenshotOne (https://screenshotone.com)
//   - Activated by setting SCREENSHOTONE_ACCESS_KEY
//   - If no key, returns null and ingest continues normally (no-op)
//
// To add another provider, mirror this file's shape — keep the public
// `captureScreenshot(url, opts)` signature stable.
//
// Storage: if SCREENSHOT_STORAGE_BUCKET is set, we mirror the captured
// PNG to Supabase Storage so URLs survive any provider-side TTL. Mirrors
// the lib/video/storage.ts pattern.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureBucket } from '@/lib/storage/ensure-bucket'

// Default bucket name when SCREENSHOT_STORAGE_BUCKET is unset. Auto-
// created via ensureBucket so the system "just works" — no manual
// Supabase Studio click required.
const DEFAULT_SCREENSHOT_BUCKET = 'screenshots'

export interface CaptureResult {
  /** Permanent URL (Supabase Storage) if mirrored, else upstream URL. */
  url: string
  /** Whether we own the URL (Storage) or it's borrowed (upstream). */
  mirrored: boolean
  capturedAt: string
}

export interface CaptureOptions {
  viewport?: { width: number; height: number }
  /** Full-page (scroll-and-stitch) vs. just the visible viewport. */
  fullPage?: boolean
  /** Wait for the page to settle (ms). Some marketing sites animate in. */
  delayMs?: number
}

const DEFAULT_OPTIONS: Required<CaptureOptions> = {
  viewport: { width: 1440, height: 900 },
  fullPage: true,
  delayMs: 1500,
}

/**
 * Capture a screenshot of a public URL. Returns null if no provider is
 * configured (graceful degrade — ingest still works without screenshots).
 *
 * @param supabase - Service-role client, used for the optional Storage mirror.
 * @param userId   - User who owns the project; namespaces the storage path.
 * @param projectId - Project being captured; suffixes the storage path.
 * @param targetUrl - URL to screenshot (project's website).
 */
export async function captureScreenshot(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  targetUrl: string,
  options: CaptureOptions = {},
): Promise<CaptureResult | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options, viewport: { ...DEFAULT_OPTIONS.viewport, ...options.viewport } }

  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY
  if (!accessKey) {
    console.log('[screenshots] SCREENSHOTONE_ACCESS_KEY not set; skipping capture')
    return null
  }

  // ScreenshotOne signed URL. Returns the PNG directly — we fetch it,
  // optionally mirror to Storage, and return the public URL.
  const params = new URLSearchParams({
    access_key: accessKey,
    url: targetUrl,
    viewport_width: String(opts.viewport.width),
    viewport_height: String(opts.viewport.height),
    full_page: String(opts.fullPage),
    delay: String(Math.round(opts.delayMs / 1000)), // seconds
    format: 'png',
    block_ads: 'true',
    block_cookie_banners: 'true',
    block_trackers: 'true',
    cache: 'true',
    cache_ttl: '86400', // 24h — fine for our purpose; re-ingest re-captures
  })

  const upstreamUrl = `https://api.screenshotone.com/take?${params.toString()}`

  let imageBuffer: ArrayBuffer
  try {
    const res = await fetch(upstreamUrl, {
      // ScreenshotOne can take a few seconds for full-page captures.
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[screenshots] capture failed: HTTP ${res.status} ${text.slice(0, 200)}`)
      return null
    }
    imageBuffer = await res.arrayBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[screenshots] capture error:', msg)
    return null
  }

  // Mirror to Storage. Bucket name from env var, with a sensible default
  // ('screenshots') so this works without manual configuration. ensureBucket
  // creates it on first use if missing — self-healing.
  const bucketName = process.env.SCREENSHOT_STORAGE_BUCKET || DEFAULT_SCREENSHOT_BUCKET
  const bucketReady = await ensureBucket(supabase, bucketName)
  if (!bucketReady) {
    console.warn(
      `[screenshots] could not ensure bucket "${bucketName}". Screenshot will not be mirrored — downstream consumers will lose it after the upstream cache expires.`,
    )
    return {
      url: upstreamUrl,
      mirrored: false,
      capturedAt: new Date().toISOString(),
    }
  }

  // Path: <user_id>/<project_id>/<timestamp>.png. Versioned so a re-capture
  // doesn't clobber prior screenshots — useful if we later want history.
  const filename = `${Date.now()}.png`
  const path = `${userId}/${projectId}/${filename}`

  const { error: uploadErr } = await supabase.storage
    .from(bucketName)
    .upload(path, imageBuffer, {
      contentType: 'image/png',
      upsert: false,
    })

  if (uploadErr) {
    console.error('[screenshots] Storage upload failed:', uploadErr.message)
    return {
      url: upstreamUrl,
      mirrored: false,
      capturedAt: new Date().toISOString(),
    }
  }

  const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(path)
  if (!pub?.publicUrl) {
    console.error('[screenshots] No public URL returned from storage')
    return {
      url: upstreamUrl,
      mirrored: false,
      capturedAt: new Date().toISOString(),
    }
  }

  return {
    url: pub.publicUrl,
    mirrored: true,
    capturedAt: new Date().toISOString(),
  }
}
