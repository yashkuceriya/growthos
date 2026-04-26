import { describe, it, expect } from 'vitest'
import { CREATIVE_MODES, getMode, modeBlock, DEFAULT_MODE_ID } from './modes'

describe('CREATIVE_MODES', () => {
  it('has unique ids', () => {
    const ids = CREATIVE_MODES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every mode has both copy and visual directives', () => {
    for (const m of CREATIVE_MODES) {
      expect(m.copy_directive.length).toBeGreaterThan(20)
      expect(m.visual_directive.length).toBeGreaterThan(20)
    }
  })

  it('default mode id resolves to a real mode', () => {
    expect(getMode(DEFAULT_MODE_ID)).not.toBeNull()
  })
})

describe('getMode', () => {
  it('returns the mode for a known id', () => {
    expect(getMode('funny')?.label).toBe('Funny')
  })

  it('returns null for unknown ids', () => {
    expect(getMode('totally-made-up')).toBeNull()
  })

  it('returns null for null/undefined inputs', () => {
    expect(getMode(null)).toBeNull()
    expect(getMode(undefined)).toBeNull()
  })
})

describe('modeBlock', () => {
  it('returns empty string for null/unknown so callers can splice unconditionally', () => {
    expect(modeBlock(null, 'copy')).toBe('')
    expect(modeBlock(undefined, 'copy')).toBe('')
    expect(modeBlock('not-a-mode', 'copy')).toBe('')
  })

  it('embeds the copy directive when surface=copy', () => {
    const block = modeBlock('shocking', 'copy')
    expect(block).toContain('SHOCKING')
    expect(block).toContain('pattern-interrupt')
  })

  it('embeds the visual directive when surface=visual', () => {
    const block = modeBlock('heartfelt', 'visual')
    expect(block).toContain('HEARTFELT')
    expect(block).toContain('Warm tones')
  })

  it('copy and visual blocks are different surfaces of the same mode', () => {
    const c = modeBlock('contrarian', 'copy')
    const v = modeBlock('contrarian', 'visual')
    expect(c).not.toBe(v)
    expect(c).toContain('Reject the consensus')
    expect(v).toContain('inversion')
  })
})
