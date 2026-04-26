import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openaiProvider } from './openai'
import { xaiProvider } from './xai'
import { MissingProviderKeyError } from '../types'

// Both Sora and Grok have to throw the typed key-missing error so the UI can
// surface a clean message instead of a 500.

describe('openaiProvider key gating', () => {
  let saved: string | undefined
  beforeEach(() => { saved = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY })
  afterEach(() => { if (saved) process.env.OPENAI_API_KEY = saved })

  it('submit throws MissingProviderKeyError when OPENAI_API_KEY is unset', async () => {
    await expect(
      openaiProvider.submit('sora-2', { prompt: 'x', durationSeconds: 5 }),
    ).rejects.toThrow(MissingProviderKeyError)
  })

  it('poll throws MissingProviderKeyError when OPENAI_API_KEY is unset', async () => {
    await expect(openaiProvider.poll('sora-2', 'r')).rejects.toThrow(MissingProviderKeyError)
  })
})

describe('xaiProvider key gating', () => {
  let saved: string | undefined
  beforeEach(() => { saved = process.env.XAI_API_KEY; delete process.env.XAI_API_KEY })
  afterEach(() => { if (saved) process.env.XAI_API_KEY = saved })

  it('submit throws MissingProviderKeyError when XAI_API_KEY is unset', async () => {
    await expect(
      xaiProvider.submit('grok-imagine', { prompt: 'x', durationSeconds: 5 }),
    ).rejects.toThrow(MissingProviderKeyError)
  })

  it('poll throws MissingProviderKeyError when XAI_API_KEY is unset', async () => {
    await expect(xaiProvider.poll('grok-imagine', 'r')).rejects.toThrow(MissingProviderKeyError)
  })
})
