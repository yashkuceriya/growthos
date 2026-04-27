import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mirrorToStorage } from './storage'
import { __resetEnsureBucketCache } from '@/lib/storage/ensure-bucket'

interface FakeStorageState {
  uploadCalled: boolean
  publicUrl: string
  uploadError: string | null
  /** Whether the bucket already exists (controls listBuckets response). */
  bucketExists: boolean
}

function makeFakeSupabase(state: FakeStorageState) {
  return {
    storage: {
      // Used by ensureBucket
      listBuckets: vi.fn(async () => ({
        data: state.bucketExists ? [{ name: 'videos' }] : [],
        error: null,
      })),
      createBucket: vi.fn(async () => ({ error: null })),
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
    // Reset ensureBucket memoization so each test sees a fresh
    // listBuckets/createBucket round-trip.
    __resetEnsureBucketCache()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.VIDEO_STORAGE_BUCKET
    else process.env.VIDEO_STORAGE_BUCKET = saved
    fetchSpy.mockRestore()
  })

  it('uses default "videos" bucket when env var is unset', async () => {
    // The new self-healing behavior: if no env var is set, fall back to
    // the default 'videos' bucket and ensure it exists. Replaces the old
    // no-op behavior, which left video URLs with their 24-48h upstream TTL.
    delete process.env.VIDEO_STORAGE_BUCKET
    fetchSpy.mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }))
    const supabase = makeFakeSupabase({
      uploadCalled: false,
      publicUrl: 'https://supabase.example/videos/u1/r1.mp4',
      uploadError: null,
      bucketExists: true,
    })
    const r = await mirrorToStorage(supabase, { renderId: 'r1', userId: 'u1', sourceUrl: 'https://x' })
    expect(r.mirrored).toBe(true)
    expect(r.newUrl).toBe('https://supabase.example/videos/u1/r1.mp4')
  })

  it('uploads and returns the new public URL on happy path', async () => {
    process.env.VIDEO_STORAGE_BUCKET = 'videos'
    fetchSpy.mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }))
    const supabase = makeFakeSupabase({
      uploadCalled: false,
      publicUrl: 'https://supabase.example/videos/u1/r1.mp4',
      uploadError: null,
      bucketExists: true,
    })
    const r = await mirrorToStorage(supabase, { renderId: 'r1', userId: 'u1', sourceUrl: 'https://fal.cdn/x.mp4' })
    expect(r.mirrored).toBe(true)
    expect(r.newUrl).toBe('https://supabase.example/videos/u1/r1.mp4')
  })

  it('returns mirrored=false with error if source fetch fails', async () => {
    process.env.VIDEO_STORAGE_BUCKET = 'videos'
    fetchSpy.mockResolvedValue(new Response('', { status: 404 }))
    const supabase = makeFakeSupabase({
      uploadCalled: false,
      publicUrl: '',
      uploadError: null,
      bucketExists: true,
    })
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
      bucketExists: true,
    })
    const r = await mirrorToStorage(supabase, { renderId: 'r1', userId: 'u1', sourceUrl: 'https://x' })
    expect(r.mirrored).toBe(false)
    expect(r.error).toMatch(/policy/)
  })
})
