import Link from 'next/link'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-md rounded-md border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <p className="font-mono-data text-xs font-semibold uppercase text-emerald-300">404</p>
        <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          This route is not part of the local GrowthOS workspace.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-bold uppercase text-slate-950 hover:bg-emerald-400"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
      </section>
    </main>
  )
}
