import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
// TODO: Replace with auto-generated types from `supabase gen types typescript`
// import type { Database } from './types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from Server Component — cookies will be set by middleware
          }
        },
      },
    }
  )
}

/** Service-role client for trusted server-side operations (webhooks, edge functions).
 *  Never expose to the client or use in Server Components rendered for users. */
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}
