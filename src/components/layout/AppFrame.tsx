'use client'

import { useState } from 'react'
import { AppSidebar } from './AppSidebar'
import { TopBar } from './TopBar'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export function AppFrame({ children }: { children: React.ReactNode }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  return (
    <div className="flex h-screen min-w-0 overflow-hidden bg-slate-900">
      <div className="hidden shrink-0 md:block">
        <AppSidebar />
      </div>
      <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <SheetContent side="left" className="w-60 max-w-[85vw] gap-0 border-slate-800 bg-[#0b1220] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>GrowthOS navigation</SheetTitle>
            <SheetDescription>Open a GrowthOS workspace.</SheetDescription>
          </SheetHeader>
          <AppSidebar onNavigate={() => setMobileNavigationOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onOpenNavigation={() => setMobileNavigationOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
