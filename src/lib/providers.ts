import { BifrostApiError } from './api'
import type { SessionSource } from './auth-token'

/**
 * Login-page provider discovery (api-v1.md §5.15, ADR-0011):
 * `GET /api/v1/auth/providers` tells the login page which sign-in methods
 * the backend serves — a local username/password form (`--local-auth`)
 * and/or SSO against the OIDC issuer. The endpoint is public and always
 * mounted on auth-enabled backends; older/unauthenticated backends 404 it,
 * in which case the login page falls back to env-based discovery.
 */

export interface AuthProviders {
  /** Local username/password login (`POST /api/v1/auth/login`). */
  local: boolean
  /** OIDC SSO; the backend-reported issuer overrides the VITE default. */
  oidc: { issuer: string } | null
}

/**
 * Tolerant per-field parse of the providers body: a non-object body yields
 * null (caller falls back); a well-formed body with missing/mis-typed
 * fields degrades field by field.
 */
export function parseProviders(body: unknown): AuthProviders | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  let oidc: AuthProviders['oidc'] = null
  if (typeof record.oidc === 'object' && record.oidc !== null) {
    const issuer = (record.oidc as Record<string, unknown>).issuer
    if (typeof issuer === 'string' && issuer !== '') oidc = { issuer }
  }
  return { local: record.local === true, oidc }
}

/**
 * Discovery for backends that predate `/api/v1/auth/providers` (404) or
 * serve a malformed body: SSO only when VITE_MOBULA_ISSUER was explicitly
 * set (the built-in default points at a Keycloak that may not exist), no
 * local form; the paste-token path is always available regardless.
 */
export function fallbackProviders(envIssuer: string | undefined): AuthProviders {
  return {
    local: false,
    oidc: envIssuer != null && envIssuer !== '' ? { issuer: envIssuer } : null,
  }
}

/**
 * Local login failure → inline message. The backend answers every failure
 * (unknown user, wrong password, locked, disabled) with the identical 401
 * `invalid_credentials` — no enumeration by design — so the UI mirrors that
 * and never speculates about which field failed (api-v1.md §5.15).
 */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof BifrostApiError) {
    if (err.status === 401) return 'Invalid username or password.'
    if (err.isUnreachable) {
      return 'Cannot reach the Bifrost control plane.'
    }
  }
  return 'Sign-in failed. Try again.'
}

export type SignOutPlan =
  | { kind: 'sso-logout' }
  | { kind: 'local-logout' }
  | { kind: 'clear' }

/**
 * Sign-out path per session source: SSO sessions redirect through the
 * issuer's logout endpoint so the IdP session dies too; local sessions get
 * a best-effort PAT revocation (`POST /api/v1/auth/logout`) before
 * clearing; pasted tokens and the dev stub just clear.
 */
export function planSignOut(source: SessionSource): SignOutPlan {
  switch (source) {
    case 'sso':
      return { kind: 'sso-logout' }
    case 'local':
      return { kind: 'local-logout' }
    default:
      return { kind: 'clear' }
  }
}
