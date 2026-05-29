import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TopBar } from '@/components/layout/TopBar'
import { ProjectProvider } from '@/hooks/use-project'
import { LOCAL_DEV_AUTH_COOKIE, isLocalDevAuthEnabled } from '@/lib/local-dev-auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const hasLocalDevSession =
    isLocalDevAuthEnabled() && cookieStore.get(LOCAL_DEV_AUTH_COOKIE)?.value === '1'

  if (hasLocalDevSession) {
    return (
      <ProjectProvider>
        <div className="flex h-screen overflow-hidden bg-slate-900">
          <AppSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
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
      <div className="flex h-screen overflow-hidden bg-slate-900">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ProjectProvider>
  )
}
