'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-md rounded-md border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-rose-500/15 text-rose-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold">Something broke</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          GrowthOS hit an unexpected error. Retry this screen first; if it keeps happening, run the local doctor.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono-data text-xs text-slate-500">Digest: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={unstable_retry}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-bold uppercase text-slate-950 hover:bg-emerald-400"
        >
          <RotateCcw className="h-4 w-4" />
          Retry
        </button>
      </section>
    </main>
  )
}
