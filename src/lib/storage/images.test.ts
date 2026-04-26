import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { decodeDataUrl, uploadAdImage } from './images'

describe('decodeDataUrl', () => {
  it('decodes a valid data URL into buffer + mime', () => {
    // 1x1 transparent PNG
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='
    const r = decodeDataUrl(dataUrl)
    expect(r).not.toBeNull()
    expect(r?.mime).toBe('image/png')
    expect(r?.buffer.length).toBeGreaterThan(40)
  })

  it('returns null for non-data inputs', () => {
    expect(decodeDataUrl('https://example.com/x.png')).toBeNull()
    expect(decodeDataUrl('garbage')).toBeNull()
  })
})

interface FakeStorageState {
  uploadCalls: Array<{ path: string; mime: string }>
  publicUrl: string
  uploadError: string | null
}

function makeFakeSupabase(state: FakeStorageState) {
  return {
    storage: {
      from: () => ({
        upload: vi.fn(async (path: string, _buf: unknown, opts: { contentType: string }) => {
          state.uploadCalls.push({ path, mime: opts.contentType })
          return { error: state.uploadError ? { message: state.uploadError } : null }
        }),
        getPublicUrl: () => ({ data: { publicUrl: state.publicUrl } }),
      }),
    },
  } as never
}

describe('uploadAdImage', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') })
  afterEach(() => { fetchSpy.mockRestore() })

  it('decodes a data URL and uploads, returning the public URL', async () => {
    const state: FakeStorageState = {
      uploadCalls: [],
      publicUrl: 'https://supabase.example/ad-images/u1/a1/x.png',
      uploadError: null,
    }
    const supabase = makeFakeSupabase(state)
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='
    const url = await uploadAdImage({
      supabase, userId: 'u1', adCopyId: 'a1', aspect: '1:1', source: dataUrl,
    })
    expect(url).toBe(state.publicUrl)
    expect(state.uploadCalls).toHaveLength(1)
    expect(state.uploadCalls[0]?.path).toContain('u1/a1/')
    expect(state.uploadCalls[0]?.mime).toBe('image/png')
  })

  it('falls back to the source data URL on upload failure', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const state: FakeStorageState = { uploadCalls: [], publicUrl: '', uploadError: 'no bucket' }
    const supabase = makeFakeSupabase(state)
    const url = await uploadAdImage({
      supabase, userId: 'u1', adCopyId: 'a1', aspect: '1:1', source: dataUrl,
    })
    expect(url).toBe(dataUrl)
  })

  it('fetches an https source URL and uploads the bytes', async () => {
    fetchSpy.mockResolvedValue(
      new Response(new ArrayBuffer(8), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    )
    const state: FakeStorageState = {
      uploadCalls: [],
      publicUrl: 'https://supabase.example/x.jpg',
      uploadError: null,
    }
    const supabase = makeFakeSupabase(state)
    const url = await uploadAdImage({
      supabase, userId: 'u1', adCopyId: 'a1', aspect: '9:16',
      source: 'https://upstream.example/x.jpg',
    })
    expect(url).toBe(state.publicUrl)
    expect(state.uploadCalls[0]?.mime).toBe('image/jpeg')
    expect(state.uploadCalls[0]?.path).toMatch(/\.jpg$/)
  })

  it('falls back to the source URL when the source fetch fails', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 500 }))
    const state: FakeStorageState = { uploadCalls: [], publicUrl: '', uploadError: null }
    const supabase = makeFakeSupabase(state)
    const url = await uploadAdImage({
      supabase, userId: 'u1', adCopyId: 'a1', aspect: '1:1',
      source: 'https://upstream.example/x.jpg',
    })
    expect(url).toBe('https://upstream.example/x.jpg')
    expect(state.uploadCalls).toHaveLength(0)
  })
})
