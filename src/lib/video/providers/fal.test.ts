import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { falProvider } from './fal'
import { MissingProviderKeyError, UnsupportedModelError } from '../types'

describe('falProvider.submit', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  let savedKey: string | undefined
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    savedKey = process.env.FAL_KEY
  })
  afterEach(() => {
    fetchSpy.mockRestore()
    if (savedKey === undefined) delete process.env.FAL_KEY
    else process.env.FAL_KEY = savedKey
  })

  it('throws MissingProviderKeyError when FAL_KEY is unset', async () => {
    delete process.env.FAL_KEY
    await expect(
      falProvider.submit('kling-2', { prompt: 'x', durationSeconds: 5 }),
    ).rejects.toThrow(MissingProviderKeyError)
  })

  it('throws UnsupportedModelError for a non-fal model', async () => {
    process.env.FAL_KEY = 'k'
    await expect(
      falProvider.submit('sora-2', { prompt: 'x', durationSeconds: 5 }),
    ).rejects.toThrow(UnsupportedModelError)
  })

  it('returns the fal request_id on success', async () => {
    process.env.FAL_KEY = 'k'
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ request_id: 'req_abc' }), { status: 200 }),
    )
    const r = await falProvider.submit('kling-2', { prompt: 'a cat in space', durationSeconds: 10 })
    expect(r.providerRequestId).toBe('req_abc')
  })

  it('clamps duration per model max_seconds', async () => {
    process.env.FAL_KEY = 'k'
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ request_id: 'r' }), { status: 200 }))
    await falProvider.submit('hailuo-02', { prompt: 'x', durationSeconds: 30 })
    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.duration).toBeLessThanOrEqual(6) // hailuo max
  })

  it('surfaces fal error detail on submit failure', async () => {
    process.env.FAL_KEY = 'k'
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'invalid prompt' }), { status: 400 }),
    )
    await expect(
      falProvider.submit('kling-2', { prompt: 'x', durationSeconds: 5 }),
    ).rejects.toThrow(/invalid prompt/)
  })
})

describe('falProvider.poll', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    process.env.FAL_KEY = 'k'
  })
  afterEach(() => fetchSpy.mockRestore())

  it('maps IN_QUEUE → queued', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ status: 'IN_QUEUE' }), { status: 200 }))
    const r = await falProvider.poll('kling-2', 'req_1')
    expect(r.status).toBe('queued')
  })

  it('maps IN_PROGRESS → rendering', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ status: 'IN_PROGRESS' }), { status: 200 }))
    const r = await falProvider.poll('kling-2', 'req_1')
    expect(r.status).toBe('rendering')
  })

  it('maps FAILED → failed with logs', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: 'FAILED', logs: [{ message: 'OOM' }] }), { status: 200 }),
    )
    const r = await falProvider.poll('kling-2', 'req_1')
    expect(r.status).toBe('failed')
    expect(r.error).toContain('OOM')
  })

  it('maps COMPLETED → completed and pulls video URL', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ video: { url: 'https://cdn.fal/x.mp4' } }), { status: 200 }),
      )
    const r = await falProvider.poll('kling-2', 'req_1')
    expect(r.status).toBe('completed')
    expect(r.videoUrl).toBe('https://cdn.fal/x.mp4')
  })

  it('returns failed if completed response has no video URL', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    const r = await falProvider.poll('kling-2', 'req_1')
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/No video URL/)
  })
})
