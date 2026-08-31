import { CloudOff, Lock, LogIn, PackageOpen, SearchX, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { MobulaApiError } from '@/lib/api'
import { startSsoSignIn } from '@/lib/pkce'

/**
 * Shared empty/error state (spec §6). Every list has first-run, no-results,
 * backend-unreachable, and permission-denied variants — this is the one
 * component for all of them.
 */
export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <div className="text-sm font-medium">{title}</div>
      {description ? (
        <div className="max-w-md text-sm text-muted-foreground">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-2 flex gap-2">{action}</div> : null}
    </div>
  )
}

/**
 * Maps a failed TanStack Query error to the right empty-state variant:
 * network failure → backend-unreachable, 401 → sign-in-required (the one
 * shared handling point for auth-enabled backends), 404 →
 * not-implemented-yet (the Phase 3 management API from spec §8 hasn't
 * landed), 403 → permission-denied with required vs granted role
 * (spec §1.4.6, §5.10).
 */
export function ApiErrorState({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  const retry = onRetry ? (
    <Button variant="outline" size="sm" onClick={onRetry}>
      Retry
    </Button>
  ) : undefined

  if (error instanceof MobulaApiError) {
    if (error.isUnauthorized) {
      return (
        <EmptyState
          icon={LogIn}
          title="Sign in required"
          description="This control plane requires authentication. Sign in to continue."
          action={
            <>
              <Button
                size="sm"
                onClick={() =>
                  // Return to this page after the SSO round-trip.
                  void startSsoSignIn(
                    `${window.location.pathname}${window.location.search}`,
                  )
                }
              >
                Sign in with SSO
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/login">Use an API token</Link>
              </Button>
            </>
          }
        />
      )
    }
    if (error.isForbidden) {
      return (
        <EmptyState
          icon={Lock}
          title="Access denied"
          description={
            <>
              This action requires the{' '}
              <code className="text-foreground">
                {error.requiredRole ?? 'unknown'}
              </code>{' '}
              role; your identity was granted{' '}
              <code className="text-foreground">
                {error.grantedRole ?? 'unknown'}
              </code>
              .
            </>
          }
          action={retry}
        />
      )
    }
    if (error.isNotImplemented) {
      return (
        <EmptyState
          icon={PackageOpen}
          title="Not implemented in the control plane yet"
          description="This screen is backed by Bifrost's Phase 3 management API (spec §8), which the running backend does not serve yet. The UI is ready; the endpoint is on the backend roadmap."
          action={retry}
        />
      )
    }
    if (error.isUnavailable) {
      return (
        <EmptyState
          icon={CloudOff}
          title="Control plane unreachable"
          description={
            <>
              Start the backend with{' '}
              <code className="text-foreground">
                mobula serve --dev-allow-unauthenticated
              </code>{' '}
              and keep <code className="text-foreground">vite dev</code>{' '}
              running — it proxies to http://127.0.0.1:8484.
            </>
          }
          action={retry}
        />
      )
    }
  }

  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      description={error instanceof Error ? error.message : String(error)}
      action={retry}
    />
  )
}

export function NoResultsState({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No results"
      description="Nothing matches the current filters."
      action={
        onClear ? (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        ) : undefined
      }
    />
  )
}
