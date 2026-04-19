'use client'

import { Bell, HelpCircle, Search } from 'lucide-react'
import Link from 'next/link'

export function TopBar() {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6">
      {/* Search */}
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="CMD + K TO SEARCH"
          className="w-full h-9 rounded-md bg-slate-800/60 border border-slate-700 pl-9 pr-16 text-xs font-mono-data uppercase tracking-wider text-slate-300 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-slate-700 text-[10px] font-mono text-slate-400">
          ⌘K
        </kbd>
      </div>

      {/* Right links */}
      <nav className="flex items-center gap-5 text-xs font-semibold uppercase tracking-wider">
        <Link href="/docs" className="text-slate-400 hover:text-emerald-300 transition-colors">
          Docs
        </Link>
        <Link href="/updates" className="text-slate-400 hover:text-emerald-300 transition-colors">
          Updates
        </Link>
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          <Bell className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          <HelpCircle className="h-4 w-4" />
        </button>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 ring-1 ring-emerald-400/40" />
      </div>
    </header>
  )
}
