'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { KeyRound, Zap } from 'lucide-react'
import {
  LOCAL_DEV_AUTH_COOKIE,
  LOCAL_DEV_EMAIL,
  LOCAL_DEV_PASSWORD,
  isLocalDevAuthEnabled,
  isLocalDevCredentials,
} from '@/lib/local-dev-auth'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard'
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (isLocalDevCredentials(email, password)) {
        document.cookie = `${LOCAL_DEV_AUTH_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
        toast.success('Supabase unavailable; local workspace unlocked')
        router.push(redirectTo)
        router.refresh()
      } else {
        toast.error(error.message)
      }
    } else {
      document.cookie = `${LOCAL_DEV_AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`
      router.push(redirectTo)
      router.refresh()
    }
    setLoading(false)
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/callback?next=${redirectTo}` },
    })
  }

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/80 backdrop-blur p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-500 text-slate-950">
          <Zap className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 font-mono-data text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          SYSTEM_READY
        </div>
        <h1 className="mt-2 text-xl font-semibold text-slate-100">Welcome back</h1>
        <p className="text-xs text-slate-400">Sign in to your GrowthOS command center</p>
      </div>

      {/* Google */}
      <button
        onClick={handleGoogleLogin}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 hover:bg-slate-800"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-900/80 px-2 font-mono-data text-[10px] font-semibold uppercase tracking-widest text-slate-500">OR</span>
        </div>
      </div>

      <form onSubmit={handleLogin} className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Password</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
        </div>
        <button type="submit" disabled={loading} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {isLocalDevAuthEnabled() && (
        <button
          type="button"
          onClick={() => {
            setEmail(LOCAL_DEV_EMAIL)
            setPassword(LOCAL_DEV_PASSWORD)
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/15"
        >
          <KeyRound className="h-4 w-4" />
          Fill local admin
        </button>
      )}

      <p className="mt-4 text-center text-xs text-slate-400">
        No account?{' '}
        <Link href="/signup" className="font-semibold text-emerald-400 hover:text-emerald-300">Sign up free</Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-slate-900/60" />}>
      <LoginForm />
    </Suspense>
  )
}
