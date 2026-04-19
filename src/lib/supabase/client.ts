import { createBrowserClient } from '@supabase/ssr'
// TODO: Replace with auto-generated types from `supabase gen types typescript`
// import type { Database } from './types'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
