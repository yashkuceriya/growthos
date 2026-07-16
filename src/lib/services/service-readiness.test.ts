import { describe, expect, it } from 'vitest'
import {
  computeFallbackServiceIntegrations,
  computeServiceIntegrations,
  countConfiguredProviderServices,
  countLocalBlockers,
} from './service-readiness'

describe('service readiness', () => {
  it('keeps provider keys optional for the local marketing flow', () => {
    const integrations = computeServiceIntegrations({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    })

    expect(countLocalBlockers(integrations)).toBe(0)
    expect(integrations.find((i) => i.name === 'Supabase')?.status).toBe('ok')
    expect(integrations.find((i) => i.name === 'OpenRouter')?.status).toBe('optional')
    expect(integrations.find((i) => i.name === 'Resend')?.status).toBe('optional')
  })

  it('only counts foundation errors as local blockers', () => {
    const integrations = computeServiceIntegrations({})

    expect(countLocalBlockers(integrations)).toBe(1)
    expect(integrations.find((i) => i.name === 'Supabase')?.status).toBe('error')
    expect(integrations.find((i) => i.name === 'OpenRouter')?.status).toBe('optional')
  })

  it('warns when OpenRouter is configured but has no recent usage proof', () => {
    const integrations = computeServiceIntegrations({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      OPENROUTER_API_KEY: 'sk-or',
      RESEND_API_KEY: 're',
      RESEND_FROM_EMAIL: 'GrowthOS <hello@example.com>',
    })

    expect(integrations.find((i) => i.name === 'OpenRouter')?.status).toBe('warn')
    expect(countConfiguredProviderServices(integrations)).toBe(2)
  })

  it('marks OpenRouter ok once usage is proven', () => {
    const integrations = computeServiceIntegrations({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      OPENROUTER_API_KEY: 'sk-or',
    }, true)

    expect(integrations.find((i) => i.name === 'OpenRouter')?.status).toBe('ok')
  })

  it('requires the Supabase anon key for browser auth readiness', () => {
    const integrations = computeServiceIntegrations({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    })

    expect(integrations.find((i) => i.name === 'Supabase')?.status).toBe('error')
    expect(countLocalBlockers(integrations)).toBe(1)
  })

  it('does not claim verified Resend webhooks without the webhook secret', () => {
    const integrations = computeServiceIntegrations({
      RESEND_API_KEY: 're',
      RESEND_FROM_EMAIL: 'GrowthOS <hello@example.com>',
    })

    expect(integrations.find((i) => i.name === 'Resend')?.configured).toBe(true)
    expect(integrations.find((i) => i.name === 'Resend')?.detail).toContain('RESEND_WEBHOOK_SECRET')
  })

  it('reports partial Upstash configuration instead of claiming readiness', () => {
    const integrations = computeServiceIntegrations({
      UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    })

    expect(integrations.find((i) => i.name === 'Upstash rate limiting')?.configured).toBe(false)
    expect(integrations.find((i) => i.name === 'Upstash rate limiting')?.detail).toMatch(/both/i)
  })

  it('shows when signed lead capture is enforced but lacks a secret', () => {
    const integrations = computeServiceIntegrations({
      LEAD_CAPTURE_REQUIRE_TOKEN: 'true',
    })

    expect(integrations.find((i) => i.name === 'Signed lead capture')?.configured).toBe(false)
    expect(integrations.find((i) => i.name === 'Signed lead capture')?.detail).toMatch(/missing/i)
  })

  it('marks Supabase as the foundation blocker in development fallback mode', () => {
    const integrations = computeFallbackServiceIntegrations({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    })

    expect(integrations.find((i) => i.name === 'Supabase')).toEqual(expect.objectContaining({
      configured: false,
      status: 'error',
    }))
    expect(integrations.find((i) => i.name === 'Database functions')?.status).toBe('warn')
    expect(countLocalBlockers(integrations)).toBe(1)
  })
})
