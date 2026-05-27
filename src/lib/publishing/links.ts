// Pure UTM-tracking-URL builder + platform composer helpers.
//
// Phase 7 "Better Publishing" — the operator pastes copy into platforms
// manually (we don't have paid-ads APIs yet), so the least we can do is
// make their links instrumented and open the platform composer with the
// copy pre-loaded.
//
// All functions in this file are pure. URL/source canonicalization keeps
// attribution reporting clean (we want `utm_source=meta`, not "Meta" or
// "facebook" depending on caller mood).
export interface UtmParams {
  source: string
  medium: string
  campaign: string
  content?: string
  term?: string
}

// Canonical channel → UTM source/medium pairings. Keeps the analytics
// rollup buckets stable across the system.
const CHANNEL_PRESETS: Record<string, { source: string; medium: string }> = {
  meta: { source: 'meta', medium: 'paid_social' },
  facebook: { source: 'meta', medium: 'paid_social' },
  instagram: { source: 'instagram', medium: 'social' },
  twitter: { source: 'twitter', medium: 'social' },
  x: { source: 'twitter', medium: 'social' },
  linkedin: { source: 'linkedin', medium: 'social' },
  tiktok: { source: 'tiktok', medium: 'social' },
  reddit: { source: 'reddit', medium: 'social' },
  email: { source: 'newsletter', medium: 'email' },
  blog: { source: 'blog', medium: 'organic' },
  landing: { source: 'landing', medium: 'direct' },
  google: { source: 'google', medium: 'cpc' },
  google_ads: { source: 'google', medium: 'cpc' },
  search: { source: 'google', medium: 'organic' },
  organic: { source: '(direct)', medium: 'organic' },
  direct: { source: '(direct)', medium: 'none' },
}

export function presetForChannel(channel: string): { source: string; medium: string } {
  const key = channel.trim().toLowerCase()
  return CHANNEL_PRESETS[key] ?? { source: slug(key) || 'unknown', medium: 'unknown' }
}

// Build a tracking URL. We refuse to clobber pre-existing utm_* params on
// the destination (operator overrides win) but always append/replace
// missing ones to ensure attribution always lands.
export function buildTrackedUrl(destination: string, params: UtmParams): string {
  if (!destination || destination.trim().length === 0) return destination
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    // Not an absolute URL — return unchanged so we don't fabricate hosts.
    return destination
  }
  const map: Array<[string, string | undefined]> = [
    ['utm_source', params.source],
    ['utm_medium', params.medium],
    ['utm_campaign', params.campaign],
    ['utm_content', params.content],
    ['utm_term', params.term],
  ]
  for (const [k, v] of map) {
    if (v == null) continue
    const cleaned = slug(v)
    if (!cleaned) continue
    if (!url.searchParams.has(k)) {
      url.searchParams.set(k, cleaned)
    }
  }
  return url.toString()
}

// Build a tracking URL for a specific asset given the campaign + channel.
export function buildAssetTrackingUrl(opts: {
  destination: string
  campaignSlug: string
  channel: string
  assetId?: string
  assetKind?: string
}): string {
  const preset = presetForChannel(opts.channel)
  return buildTrackedUrl(opts.destination, {
    source: preset.source,
    medium: preset.medium,
    campaign: opts.campaignSlug,
    content: opts.assetId && opts.assetKind ? `${opts.assetKind}_${opts.assetId.slice(0, 8)}` : opts.assetKind,
  })
}

// ---- Platform composer links --------------------------------------------
// Open the operator's native composer with the copy pre-loaded. Each
// platform supports a different intent URL; unsupported platforms return
// null (the UI shows a "copy text" button instead).
export interface ComposerLinkInput {
  platform: string
  text: string
  url?: string | null
}

export function composerLinkFor(input: ComposerLinkInput): string | null {
  const platform = input.platform.trim().toLowerCase()
  const text = (input.text ?? '').trim()
  switch (platform) {
    case 'twitter':
    case 'x': {
      // Web intent — opens the X composer with text + optional URL.
      const params = new URLSearchParams()
      params.set('text', input.url ? `${text}\n\n${input.url}` : text)
      return `https://twitter.com/intent/tweet?${params.toString()}`
    }
    case 'linkedin': {
      // LinkedIn's share URL accepts a single `url` param. There's no
      // public composer endpoint that pre-fills body text, so we direct
      // the user to write a post next to their copied URL.
      if (input.url) {
        const params = new URLSearchParams({ url: input.url })
        return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`
      }
      // Without a URL, LinkedIn has no useful pre-fill — return their
      // composer landing page so the operator can paste manually.
      return 'https://www.linkedin.com/feed/?shareActive=true'
    }
    case 'reddit': {
      if (input.url) {
        const params = new URLSearchParams({ title: text.slice(0, 300), url: input.url })
        return `https://www.reddit.com/submit?${params.toString()}`
      }
      const params = new URLSearchParams({ title: text.slice(0, 300), text })
      return `https://www.reddit.com/submit?${params.toString()}`
    }
    case 'facebook':
    case 'meta': {
      if (input.url) {
        const params = new URLSearchParams({ u: input.url })
        return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`
      }
      return 'https://www.facebook.com/'
    }
    case 'whatsapp': {
      const params = new URLSearchParams({ text: input.url ? `${text}\n${input.url}` : text })
      return `https://wa.me/?${params.toString()}`
    }
    case 'email': {
      const subject = encodeURIComponent(text.split('\n')[0] ?? '')
      const body = encodeURIComponent(input.url ? `${text}\n\n${input.url}` : text)
      return `mailto:?subject=${subject}&body=${body}`
    }
    default:
      return null
  }
}

// Returns the human-readable name we show on the "Open in X" button.
export function composerLabelFor(platform: string): string {
  const p = platform.trim().toLowerCase()
  switch (p) {
    case 'twitter':
    case 'x': return 'X composer'
    case 'linkedin': return 'LinkedIn share'
    case 'reddit': return 'Reddit submit'
    case 'facebook':
    case 'meta': return 'Facebook share'
    case 'whatsapp': return 'WhatsApp'
    case 'email': return 'Email draft'
    case 'tiktok': return 'TikTok (manual)'
    case 'instagram': return 'Instagram (manual)'
    default: return `${platform} composer`
  }
}

// Light slug — only kept lowercase a-z 0-9 + dashes for UTM safety.
function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

// Build a stable campaign-slug from the campaign name + id. Used as
// `utm_campaign` so the analytics rollup can group sibling assets.
export function campaignSlugFor(name: string, id: string): string {
  const base = slug(name).slice(0, 32)
  const suffix = id.replace(/-/g, '').slice(0, 6)
  if (!base) return suffix
  return `${base}_${suffix}`
}
