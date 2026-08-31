import { Outlet } from 'react-router'

import { useSilentSso } from '@/auth/use-silent-sso'
import { HealthIndicator } from '@/components/layout/health-indicator'
import { IdentityChip } from '@/components/layout/identity-chip'
import { Sidebar } from '@/components/layout/sidebar'
import { ThemeToggle } from '@/components/layout/theme-toggle'

/** App shell per spec §4: left sidebar nav + top bar. */
export function AppShell() {
  // Signed out but the IdP may still hold a session? Try silently, once.
  useSilentSso()
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b px-4">
          {/* Project switcher goes here once projects land (Phase 3). */}
          <HealthIndicator />
          <ThemeToggle />
          <IdentityChip />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
