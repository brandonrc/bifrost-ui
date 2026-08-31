import type { AuthProviders } from './providers'

/**
 * Silent auto-SSO: when the backend reports an OIDC issuer and nobody is
 * signed in, the app attempts the standard Authorization Code + PKCE
 * redirect with `prompt=none` on its own — a user who already holds a
 * Keycloak session (e.g. arriving from the Nebari landing page) bounces
 * straight back through `/auth/callback` signed in, without ever clicking
 * "Sign in with SSO". Without an IdP session, Keycloak answers
 * `error=login_required` and the callback lands on /login quietly.
 *
 * The attempt is guarded by a sessionStorage flag (`mobula.sso.silent-attempted`)
 * so a failed attempt never loops: it is set when an attempt starts, kept on
 * a `login_required`-style denial, and cleared only on a successful sign-in
 * or an explicit sign-out. Explicit "Sign in with SSO" clicks are untouched
 * (no `prompt=none`).
 */

/** sessionStorage key marking that this tab already tried silent SSO. */
export const SILENT_SSO_ATTEMPTED_KEY = 'mobula.sso.silent-attempted'

function defaultSessionStorage(): Storage | undefined {
  return typeof window !== 'undefined' ? window.sessionStorage : undefined
}

/** Has this tab already attempted (or been denied) a silent sign-in? */
export function wasSilentSsoAttempted(
  storage: Storage | undefined = defaultSessionStorage(),
): boolean {
  return storage?.getItem(SILENT_SSO_ATTEMPTED_KEY) != null
}

/** Record that a silent attempt started (timestamp for debuggability). */
export function markSilentSsoAttempted(
  storage: Storage | undefined = defaultSessionStorage(),
  now = Date.now(),
): void {
  storage?.setItem(SILENT_SSO_ATTEMPTED_KEY, String(now))
}

/** Re-arm silent SSO — on successful sign-in and on explicit sign-out. */
export function clearSilentSsoAttempt(
  storage: Storage | undefined = defaultSessionStorage(),
): void {
  storage?.removeItem(SILENT_SSO_ATTEMPTED_KEY)
}

/**
 * OIDC errors that mean "the issuer could not sign in without interaction"
 * (RFC-defined responses to `prompt=none`) — a benign outcome for a silent
 * attempt, never a failure card.
 */
export function isSilentSsoDenial(error: string | null | undefined): boolean {
  return (
    error === 'login_required' ||
    error === 'interaction_required' ||
    error === 'consent_required' ||
    error === 'account_selection_required'
  )
}

/**
 * Decide whether to fire a silent `prompt=none` redirect right now.
 * Returns the issuer to target, or null to stay put. Conditions:
 *
 * - a previous attempt in this tab must not have been made (guard flag);
 * - nobody is signed in (any session source — SSO, local, pasted, dev);
 * - no stored refresh token (silent refresh owns that recovery path);
 * - not on `/auth/callback` (a code exchange may be in flight);
 * - the providers report an OIDC issuer.
 */
export function silentSsoIssuer(options: {
  providers: AuthProviders | null | undefined
  signedIn: boolean
  hasRefreshToken: boolean
  pathname: string
  attempted: boolean
}): string | null {
  if (options.attempted) return null
  if (options.signedIn) return null
  if (options.hasRefreshToken) return null
  if (options.pathname.startsWith('/auth/callback')) return null
  return options.providers?.oidc?.issuer ?? null
}
