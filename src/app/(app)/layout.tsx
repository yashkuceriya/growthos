import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { AppFrame } from '@/components/layout/AppFrame'
import { ProjectProvider } from '@/hooks/use-project'
import { LOCAL_DEV_AUTH_COOKIE, isLocalDevAuthEnabled } from '@/lib/local-dev-auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const hasLocalDevSession =
    isLocalDevAuthEnabled() && cookieStore.get(LOCAL_DEV_AUTH_COOKIE)?.value === '1'

  if (hasLocalDevSession) {
    return (
      <ProjectProvider>
        <AppFrame>{children}</AppFrame>
      </ProjectProvider>
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <ProjectProvider>
      <AppFrame>{children}</AppFrame>
    </ProjectProvider>
  )
}
