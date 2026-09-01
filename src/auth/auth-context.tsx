import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api } from '@/lib/api'
import type { Identity } from '@/lib/api'
import type { SessionSource } from '@/lib/auth-token'
import {
  SESSION_EXPIRED_EVENT,
  getCurrentToken,
  getRefreshToken,
  getSessionMeta,
  identityFromToken,
  issuerBase,
  resolveSession,
  setCurrentToken,
  setRefreshToken,
  setSessionMeta,
  withReportedRoles,
} from '@/lib/auth-token'
import { refreshTokens } from '@/lib/pkce'
import { clearSilentSsoAttempt } from '@/lib/silent-sso'

/**
 * Auth session (spec §5.10). Sign-in paths: SSO redirect (Authorization
 * Code + PKCE against the OIDC issuer — `src/lib/pkce.ts`), local
 * username/password auth (ADR-0011, opaque tokens), or a pasted JWT (the
 * "advanced" path on /login). The backend-mediated session endpoints in
 * api-v1.md §5.11 remain the future standalone-mode contract.
 *
 * Precedence: a stored token becomes the session (JWTs decode client-side;
 * opaque local tokens use the login-time identity stored in the session
 * meta); with no usable access token but a stored refresh token, a silent
 * refresh is attempted before falling back to signed out; with no token at
 * all, the dev stub below mirrors `bifrost serve --dev-allow-unauthenticated`
 * when the feature flag is on. JWTs are decoded without signature
 * verification — the backend validates on every request.
 */
export function isDevAuthEnabled(): boolean {
  const flag = import.meta.env.VITE_BIFROST_DEV_AUTH
  if (flag === 'true') return true
  if (flag === 'false') return false
  // Default on in `vite dev`, off in production builds unless opted in.
  return import.meta.env.DEV
}

const DEV_IDENTITY: Identity = {
  subject: 'dev-admin@bifrost.local',
  email: 'dev-admin@bifrost.local',
  groups: ['platform-admins'],
  roles: ['admin'],
}

interface AuthContextValue {
  /** The current caller, or null when signed out. */
  identity: Identity | null
  devAuth: boolean
  /**
   * Where the identity came from: SSO redirect, local auth (ADR-0011), a
   * pasted token, the dev stub, or nobody. Drives the sign-out path
   * (`planSignOut` in src/lib/providers.ts).
   */
  sessionSource: SessionSource
  /**
   * Adopt a JWT as the session (SSO code exchange or paste); returns null
   * if malformed/expired. `kind: 'sso'` records the issuer for refresh and
   * logout; omitting options (paste) clears any stored refresh token.
   */
  signIn: (
    token: string,
    options?: { refreshToken?: string; kind?: 'sso' | 'pat'; issuer?: string },
  ) => Identity | null
  /**
   * Adopt an opaque local-auth token (ADR-0011); the login response's
   * identity becomes the session identity (no client-side decode possible).
   */
  signInLocal: (token: string, identity: Identity, expiresAt?: number) => Identity
  /** Clear the session locally (token, refresh token, meta); callers handle revocation/redirects. */
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue>({
  identity: null,
  devAuth: false,
  sessionSource: 'none',
  signIn: () => null,
  signInLocal: (_token, identity) => identity,
  signOut: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const devAuth = isDevAuthEnabled()
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => getCurrentToken())

  // Silent refresh (SSO sessions only): no usable access token (absent or
  // expired) but a stored refresh token → try grant_type=refresh_token once
  // on load before falling back to signed out, against the issuer recorded
  // in the session meta. On rejection the whole session is cleared; on a
  // network error the refresh token is kept for next load.
  useEffect(() => {
    if (getCurrentToken() != null) return
    const stored = getRefreshToken()
    if (stored == null) return
    let cancelled = false
    refreshTokens(stored, getSessionMeta()?.issuer ?? issuerBase())
      .then((tokens) => {
        if (cancelled) return
        if (tokens == null || identityFromToken(tokens.access_token) == null) {
          setCurrentToken(null)
          setRefreshToken(null)
          setSessionMeta(null)
          setToken(null)
          return
        }
        setCurrentToken(tokens.access_token)
        // Refresh-token rotation: store the new one when issued.
        if (tokens.refresh_token != null) setRefreshToken(tokens.refresh_token)
        setToken(tokens.access_token)
      })
      .catch(() => {
        // Network blip — stay signed out for now, keep the refresh token.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A 401 on an authenticated request means the held token is expired or
  // revoked — drop the session so pages fall into the sign-in state.
  useEffect(() => {
    const onSessionExpired = () => {
      setCurrentToken(null)
      setRefreshToken(null)
      setSessionMeta(null)
      setToken(null)
      queryClient.removeQueries({ queryKey: ['identity'] })
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
  }, [queryClient])

  const session = useMemo(
    () =>
      resolveSession({
        token,
        meta: getSessionMeta(),
        devIdentity: devAuth ? DEV_IDENTITY : null,
      }),
    [token, devAuth],
  )

  // Roles are authorized by the backend, not by parsing the token's groups
  // client-side (the group→role map is per-deployment; see auth-token.ts).
  // `GET /api/v1/identity` echoes the roles the server computed for this
  // caller; overlay them onto the session identity so every nav gate and
  // route guard reflects the backend's real authorization. Shares the
  // ['identity'] query key with the Access page (deduped, one request).
  // Disabled when signed out; until it resolves the provisional token roles
  // stand (fail-closed for unknown groups).
  const identityQuery = useQuery({
    queryKey: ['identity'],
    queryFn: api.identity,
    enabled: session.identity != null,
    retry: false,
    staleTime: 60_000,
  })

  const mergedIdentity = useMemo(
    () =>
      session.identity == null
        ? null
        : withReportedRoles(session.identity, identityQuery.data),
    [session.identity, identityQuery.data],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      identity: mergedIdentity,
      devAuth,
      sessionSource: session.source,
      signIn: (newToken: string, options) => {
        const trimmed = newToken.trim()
        const identity = identityFromToken(trimmed)
        if (identity == null) return null
        setSessionMeta({
          kind: options?.kind ?? 'pat',
          issuer: options?.issuer,
        })
        setCurrentToken(trimmed)
        setRefreshToken(options?.refreshToken ?? null)
        setToken(trimmed)
        // Drop any cached role fetch from a prior session so the new caller's
        // roles are fetched fresh, not inherited.
        queryClient.removeQueries({ queryKey: ['identity'] })
        // Successful sign-in re-arms silent SSO for a future signed-out tab.
        clearSilentSsoAttempt()
        return identity
      },
      signInLocal: (newToken: string, identity: Identity, expiresAt?: number) => {
        // Opaque token — nothing to validate client-side; the login
        // response's identity is the session identity (ADR-0011).
        setSessionMeta({ kind: 'local', identity, expiresAt })
        setCurrentToken(newToken)
        setRefreshToken(null)
        setToken(newToken)
        queryClient.removeQueries({ queryKey: ['identity'] })
        clearSilentSsoAttempt()
        return identity
      },
      signOut: () => {
        setCurrentToken(null)
        setRefreshToken(null)
        setSessionMeta(null)
        setToken(null)
        // Forget the signed-out caller's roles so they can't leak to the next.
        queryClient.removeQueries({ queryKey: ['identity'] })
        // Explicit sign-out re-arms silent SSO: for SSO sessions the
        // issuer logout kills the IdP session too, so the next visit's
        // silent attempt lands on /login (via login_required) as expected.
        clearSilentSsoAttempt()
      },
    }),
    [mergedIdentity, session.source, devAuth, queryClient],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
