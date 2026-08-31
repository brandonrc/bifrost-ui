import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

import { useAuth } from '@/auth/auth-context'
import { api } from '@/lib/api'
import { getRefreshToken } from '@/lib/auth-token'
import { startSsoSignIn } from '@/lib/pkce'
import { fallbackProviders, parseProviders } from '@/lib/providers'
import {
  markSilentSsoAttempted,
  silentSsoIssuer,
  wasSilentSsoAttempted,
} from '@/lib/silent-sso'

/**
 * App-bootstrap silent SSO (mounted once in the AppShell, so it covers every
 * route, not just /login — an unauthenticated deep link lands here too).
 * Once providers discovery settles, `silentSsoIssuer` decides whether to
 * fire a `prompt=none` PKCE redirect; with a live Keycloak session the user
 * comes back through /auth/callback signed in, otherwise the callback routes
 * to /login and sets the sessionStorage guard so this never loops.
 *
 * Uses the same query key as the login page, so discovery is fetched once.
 */
export function useSilentSso(): void {
  const { identity } = useAuth()
  const location = useLocation()
  const providersQuery = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.authProviders,
    retry: false,
    staleTime: 60_000,
  })
  // Fire at most once per mount — the redirect leaves the app anyway, this
  // just keeps StrictMode double-effects and re-renders from double-firing.
  const fired = useRef(false)

  const settled = !providersQuery.isPending
  const providers = settled
    ? ((providersQuery.isSuccess ? parseProviders(providersQuery.data) : null) ??
      fallbackProviders(import.meta.env.VITE_MOBULA_ISSUER))
    : null

  useEffect(() => {
    if (fired.current || providers == null) return
    const issuer = silentSsoIssuer({
      providers,
      signedIn: identity != null,
      hasRefreshToken: getRefreshToken() != null,
      pathname: location.pathname,
      attempted: wasSilentSsoAttempted(),
    })
    if (issuer == null) return
    fired.current = true
    markSilentSsoAttempted()
    void startSsoSignIn(`${location.pathname}${location.search}`, issuer, {
      prompt: 'none',
    })
  }, [providers, identity, location.pathname, location.search])
}
