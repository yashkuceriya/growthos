// Polls /api/video/poll/[id] for any render that's still in flight. Used by
// /video page (gallery) and the social compose dialog so they share one
// implementation. fal/openai/xai jobs take 30-90s, so 5s cadence is fine.

import { useEffect, useMemo, useRef } from 'react'

interface PollableRender {
  id: string
  status: string
  video_url: string | null
}

interface PollResult {
  status: string
  videoUrl?: string
  error?: string
}

const ACTIVE_STATUSES = new Set(['queued', 'rendering'])

export function useVideoPolling(
  renders: PollableRender[],
  onUpdate: (id: string, result: PollResult) => void,
  intervalMs = 5000,
) {
  // Keep the latest callback in a ref. Updating in an effect (not during
  // render) keeps react-hooks/refs happy.
  const cbRef = useRef(onUpdate)
  useEffect(() => { cbRef.current = onUpdate }, [onUpdate])

  // Stable string of pending ids — re-runs the timer when the set of
  // active renders changes, not on every render unrelated to polling.
  const pendingKey = useMemo(
    () => renders.filter((r) => ACTIVE_STATUSES.has(r.status)).map((r) => r.id).sort().join('|'),
    [renders],
  )

  useEffect(() => {
    if (!pendingKey) return
    const ids = pendingKey.split('|')
    let cancelled = false

    const tick = async () => {
      await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/video/poll/${id}`).catch(() => null)
          if (!res || cancelled) return
          const j = (await res.json().catch(() => ({}))) as PollResult
          if (cancelled) return
          cbRef.current(id, j)
        }),
      )
    }
    void tick()
    const handle = setInterval(tick, intervalMs)
    return () => { cancelled = true; clearInterval(handle) }
  }, [pendingKey, intervalMs])
}
