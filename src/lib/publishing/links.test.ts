import { describe, expect, it } from 'vitest'
import {
  buildTrackedUrl,
  buildAssetTrackingUrl,
  campaignSlugFor,
  composerLabelFor,
  composerLinkFor,
  presetForChannel,
} from './links'

describe('presetForChannel', () => {
  it('returns canonical source/medium pairs for known channels', () => {
    expect(presetForChannel('meta')).toEqual({ source: 'meta', medium: 'paid_social' })
    expect(presetForChannel('Twitter')).toEqual({ source: 'twitter', medium: 'social' })
    expect(presetForChannel('linkedin')).toEqual({ source: 'linkedin', medium: 'social' })
  })
  it('aliases x → twitter', () => {
    expect(presetForChannel('x').source).toBe('twitter')
  })
  it('falls back to slug + unknown for unknown channels', () => {
    expect(presetForChannel('podcast newsletter')).toEqual({ source: 'podcast_newsletter', medium: 'unknown' })
  })
})

describe('buildTrackedUrl', () => {
  it('appends utm params to a clean URL', () => {
    const out = buildTrackedUrl('https://example.com/landing', {
      source: 'meta', medium: 'paid_social', campaign: 'launch_q1',
    })
    expect(out).toContain('utm_source=meta')
    expect(out).toContain('utm_medium=paid_social')
    expect(out).toContain('utm_campaign=launch_q1')
  })
  it('keeps existing utm_* values intact when the destination already had them', () => {
    const out = buildTrackedUrl('https://example.com/?utm_source=existing', {
      source: 'meta', medium: 'paid_social', campaign: 'launch_q1',
    })
    expect(out).toContain('utm_source=existing')
    expect(out).toContain('utm_medium=paid_social')
  })
  it('skips empty values cleanly', () => {
    const out = buildTrackedUrl('https://example.com/', {
      source: 'meta', medium: '', campaign: 'launch_q1',
    })
    expect(out).not.toContain('utm_medium=')
  })
  it('returns the destination unchanged when it is not an absolute URL', () => {
    expect(buildTrackedUrl('/relative/path', { source: 'a', medium: 'b', campaign: 'c' })).toBe('/relative/path')
  })
  it('canonicalizes whitespace in values into safe slugs', () => {
    const out = buildTrackedUrl('https://example.com/', {
      source: 'My Source', medium: 'paid social', campaign: 'Big Launch Q1',
    })
    expect(out).toContain('utm_source=my_source')
    expect(out).toContain('utm_medium=paid_social')
    expect(out).toContain('utm_campaign=big_launch_q1')
  })
})

describe('buildAssetTrackingUrl', () => {
  it('threads channel preset into utm_source/medium and embeds asset content', () => {
    const out = buildAssetTrackingUrl({
      destination: 'https://app.example.com',
      campaignSlug: 'launch_q1',
      channel: 'twitter',
      assetId: 'abc12345-aaaa-bbbb-cccc-deadbeefcafe',
      assetKind: 'social_post',
    })
    expect(out).toContain('utm_source=twitter')
    expect(out).toContain('utm_medium=social')
    expect(out).toContain('utm_campaign=launch_q1')
    expect(out).toContain('utm_content=social_post_abc12345')
  })
})

describe('composerLinkFor', () => {
  it('builds an X intent URL with text and trailing url', () => {
    const link = composerLinkFor({ platform: 'twitter', text: 'Hello world', url: 'https://example.com' })
    expect(link).toContain('https://twitter.com/intent/tweet')
    const params = new URL(link!).searchParams
    const text = params.get('text') ?? ''
    expect(text).toContain('Hello world')
    expect(text).toContain('https://example.com')
  })
  it('uses LinkedIn share URL when a url is provided', () => {
    const link = composerLinkFor({ platform: 'linkedin', text: 'Body', url: 'https://example.com' })
    expect(link).toContain('https://www.linkedin.com/sharing/share-offsite/?url=')
  })
  it('returns reddit submit url with title + url', () => {
    const link = composerLinkFor({ platform: 'reddit', text: 'Show HN: my new app', url: 'https://example.com' })
    expect(link).toContain('https://www.reddit.com/submit')
    expect(link).toContain('title=')
    expect(link).toContain('url=')
  })
  it('returns null for unsupported platforms', () => {
    expect(composerLinkFor({ platform: 'magic-platform', text: 'x' })).toBeNull()
  })
})

describe('composerLabelFor', () => {
  it('returns nicely-formatted labels for known platforms', () => {
    expect(composerLabelFor('twitter')).toBe('X composer')
    expect(composerLabelFor('linkedin')).toBe('LinkedIn share')
    expect(composerLabelFor('email')).toBe('Email draft')
  })
})

describe('campaignSlugFor', () => {
  it('produces a stable lowercase slug with a short id suffix', () => {
    expect(campaignSlugFor('Black Friday Launch', '12345678-1234-1234-1234-123456789abc')).toBe('black_friday_launch_123456')
  })
  it('handles a missing/empty name by falling back to the id suffix', () => {
    expect(campaignSlugFor('', '12345678-1234-1234-1234-123456789abc')).toBe('123456')
  })
})
