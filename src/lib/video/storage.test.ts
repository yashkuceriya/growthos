import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mirrorToStorage } from './storage'

interface FakeStorageState {
  uploadCalled: boolean
  publicUrl: string
  uploadError: string | null
}

function makeFakeSupabase(state: FakeStorageState) {
  return {
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({
          error: state.uploadError ? { message: state.uploadError } : null,
        })),
        getPublicUrl: () => ({ data: { publicUrl: state.publicUrl } }),
      }),
    },
  } as never
}

describe('mirrorToStorage', () => {
  let saved: string | undefined
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    saved = process.env.VIDEO_STORAGE_BUCKET
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.VIDEO_STORAGE_BUCKET
    else process.env.VIDEO_STORAGE_BUCKET = saved
    fetchSpy.mockRestore()
  })

  it('returns mirrored=false when VIDEO_STORAGE_BUCKET is unset (no-op)', async () => {
    delete process.env.VIDEO_STORAGE_BUCKET
    const supabase = makeFakeSupabase({ uploadCalled: false, publicUrl: '', uploadError: null })
    const r = await mirrorToStorage(supabase, { renderId: 'r1', userId: 'u1', sourceUrl: 'https://x' })
    expect(r.mirrored).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uploads and returns the new public URL on happy path', async () => {
    process.env.VIDEO_STORAGE_BUCKET = 'videos'
    fetchSpy.mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }))
    const supabase = makeFakeSupabase({
      uploadCalled: false,
      publicUrl: 'https://supabase.example/videos/u1/r1.mp4',
      uploadError: null,
    })
    const r = await mirrorToStorage(supabase, { renderId: 'r1', userId: 'u1', sourceUrl: 'https://fal.cdn/x.mp4' })
    expect(r.mirrored).toBe(true)
    expect(r.newUrl).toBe('https://supabase.example/videos/u1/r1.mp4')
  })

  it('returns mirrored=false with error if source fetch fails', async () => {
    process.env.VIDEO_STORAGE_BUCKET = 'videos'
    fetchSpy.mockResolvedValue(new Response('', { status: 404 }))
    const supabase = makeFakeSupabase({ uploadCalled: false, publicUrl: '', uploadError: null })
    const r = await mirrorToStorage(supabase, { renderId: 'r1', userId: 'u1', sourceUrl: 'https://x' })
    expect(r.mirrored).toBe(false)
    expect(r.error).toMatch(/HTTP 404/)
  })

  it('returns mirrored=false with error if upload fails', async () => {
    process.env.VIDEO_STORAGE_BUCKET = 'videos'
    fetchSpy.mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }))
    const supabase = makeFakeSupabase({
      uploadCalled: false,
      publicUrl: 'https://x',
      uploadError: 'bucket policy denies',
    })
    const r = await mirrorToStorage(supabase, { renderId: 'r1', userId: 'u1', sourceUrl: 'https://x' })
    expect(r.mirrored).toBe(false)
    expect(r.error).toMatch(/policy/)
  })
})
