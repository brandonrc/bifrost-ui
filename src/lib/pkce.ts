import { issuerBase } from './auth-token'
import { runtimeConfig } from './runtime-config'

/**
 * SSO redirect sign-in: Authorization Code + PKCE (S256) directly against
 * the OIDC issuer — the standard SPA pattern, no client secret. The
 * backend-mediated session endpoints in api-v1.md §5.11 remain the future
 * standalone-mode contract; this flow only needs the issuer (Keycloak).
 *
 * Flow: `startSsoSignIn` generates a verifier/state pair, stashes it in
 * sessionStorage (single-use — never localStorage), and redirects to
 * `buildAuthorizeUrl`. `/auth/callback` validates the returned state with
 * `consumePkceState` (mismatch → abort) and exchanges the code with
 * `exchangeCodeForTokens`. `refreshTokens` powers silent refresh when the
 * access token expires.
 */

/**
 * Public client id configured on the issuer, when nothing overrides it — the
 * local Keycloak demo realm's client.
 */
export const DEFAULT_SSO_CLIENT_ID = 'bifrost'

/**
 * The OIDC public client id to authenticate as.
 *
 * Read at call time from `VITE_BIFROST_SSO_CLIENT_ID`, not frozen into a
 * module constant, because the id is a *per-deployment* value. An operator
 * that provisions the Keycloak client — Nebari's, for one, which derives a
 * deterministic `<namespace>-<nebariapp-name>` such as
 * `bifrost-bifrost-ui-spa` — cannot be asked to match a literal baked into
 * our bundle. Hardcoding it meant this UI could only ever talk to a client
 * someone had hand-created under one specific name, which is why gateway auth
 * could not be turned on for the operator-provisioned deployment at all.
 *
 * Mirrors `issuerBase()`: same shape, same fallback-to-default behaviour, so
 * a standalone build with no env set behaves exactly as before.
 *
 * Note for whoever wires up audience handling: the client id and the token's
 * `aud` are deliberately *separate* values here. Separate NebariApps for the
 * API and the UI mean separate client ids, so a token minted for this client
 * carries an `aud` the Bifrost validator will reject unless a Keycloak
 * audience mapper or an explicit `auth.oidc.audience` says otherwise. Do not
 * derive one from the other — that would silently couple two things that a
 * deployment needs to set independently.
 */
export function ssoClientId(): string {
  return (
    runtimeConfig().ssoClientId ||
    import.meta.env.VITE_BIFROST_SSO_CLIENT_ID ||
    DEFAULT_SSO_CLIENT_ID
  )
}

export interface PkceState {
  state: string
  verifier: string
  /** Same-origin path to land on after the callback; sanitized on store. */
  returnTo: string
  /** The issuer this attempt targets (backend-reported or VITE default). */
  issuer: string
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
}

/** sessionStorage key for the in-flight PKCE attempt (exported for tests). */
export const PKCE_STORAGE_KEY = 'bifrost.pkce'

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 48 random bytes → 64 url-safe chars (RFC 7636 verifier, 43–128 chars). */
export function generateVerifier(): string {
  const bytes = new Uint8Array(48)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

/** Random CSRF token for the `state` parameter. */
export function generateState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

/** S256 code challenge: base64url(SHA-256(verifier)) — async (crypto.subtle). */
export async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  return bytesToBase64Url(new Uint8Array(digest))
}

function oidcEndpoint(issuer: string, path: string): string {
  return `${issuer.replace(/\/+$/, '')}/protocol/openid-connect/${path}`
}

/** The callback URL must match a redirect_uri registered on the client. */
export function ssoRedirectUri(): string {
  return `${window.location.origin}/auth/callback`
}

export function buildAuthorizeUrl(options: {
  issuer: string
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  /**
   * OIDC `prompt` parameter. `'none'` makes the attempt silent: an existing
   * IdP session answers with a code immediately, no session answers with
   * `error=login_required` — never a login form (src/lib/silent-sso.ts).
   */
  prompt?: 'none'
}): string {
  const url = new URL(oidcEndpoint(options.issuer, 'auth'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('scope', 'openid')
  url.searchParams.set('state', options.state)
  url.searchParams.set('code_challenge', options.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (options.prompt != null) url.searchParams.set('prompt', options.prompt)
  return url.toString()
}

export function buildLogoutUrl(options: {
  issuer: string
  clientId: string
  postLogoutRedirectUri: string
}): string {
  const url = new URL(oidcEndpoint(options.issuer, 'logout'))
  url.searchParams.set('post_logout_redirect_uri', options.postLogoutRedirectUri)
  url.searchParams.set('client_id', options.clientId)
  return url.toString()
}

// ---------------------------------------------------------------------------
// Verifier/state stash. sessionStorage, not localStorage: these are
// single-use and tab-scoped. Storage is injectable for tests (node env).
// ---------------------------------------------------------------------------

function defaultSessionStorage(): Storage | undefined {
  return typeof window !== 'undefined' ? window.sessionStorage : undefined
}

export function storePkceState(
  entry: PkceState,
  storage: Storage | undefined = defaultSessionStorage(),
): void {
  storage?.setItem(PKCE_STORAGE_KEY, JSON.stringify(entry))
}

export function loadPkceState(
  storage: Storage | undefined = defaultSessionStorage(),
): PkceState | null {
  const raw = storage?.getItem(PKCE_STORAGE_KEY)
  if (raw == null || raw === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    if (
      typeof record.state !== 'string' ||
      typeof record.verifier !== 'string' ||
      typeof record.returnTo !== 'string' ||
      typeof record.issuer !== 'string'
    ) {
      return null
    }
    return {
      state: record.state,
      verifier: record.verifier,
      returnTo: record.returnTo,
      issuer: record.issuer,
    }
  } catch {
    return null
  }
}

export function clearPkceState(
  storage: Storage | undefined = defaultSessionStorage(),
): void {
  storage?.removeItem(PKCE_STORAGE_KEY)
}

/**
 * Validate the `state` returned by the issuer against the stash, clearing it
 * either way (single-use). Returns the entry only on an exact match —
 * a mismatch (CSRF / stale tab) must never proceed to the code exchange.
 */
export function consumePkceState(
  returnedState: string,
  storage: Storage | undefined = defaultSessionStorage(),
): PkceState | null {
  const entry = loadPkceState(storage)
  clearPkceState(storage)
  if (entry == null || entry.state !== returnedState) return null
  return entry
}

// ---------------------------------------------------------------------------
// Browser-side flow drivers (not unit-tested — thin glue over the above).
// ---------------------------------------------------------------------------

/**
 * Kick off the SSO redirect; the browser leaves the app here. Pass
 * `prompt: 'none'` for the silent auto-attempt (src/lib/silent-sso.ts);
 * explicit "Sign in with SSO" clicks omit it and keep today's behaviour.
 */
export async function startSsoSignIn(
  returnTo = '/',
  issuer: string = issuerBase(),
  options?: { prompt?: 'none' },
): Promise<void> {
  const verifier = generateVerifier()
  const state = generateState()
  const challenge = await s256Challenge(verifier)
  // Same-origin paths only — never let returnTo become an open redirect.
  const safeReturnTo =
    returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  storePkceState({ state, verifier, returnTo: safeReturnTo, issuer })
  window.location.assign(
    buildAuthorizeUrl({
      issuer,
      clientId: ssoClientId(),
      redirectUri: ssoRedirectUri(),
      state,
      codeChallenge: challenge,
      prompt: options?.prompt,
    }),
  )
}

/** Exchange the authorization code for tokens at the issuer. */
export async function exchangeCodeForTokens(
  code: string,
  entry: PkceState,
  redirectUri: string = ssoRedirectUri(),
): Promise<TokenResponse> {
  const res = await fetch(oidcEndpoint(entry.issuer, 'token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ssoClientId(),
      redirect_uri: redirectUri,
      code,
      code_verifier: entry.verifier,
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  return (await res.json()) as TokenResponse
}

/**
 * Silent refresh: swap a refresh token for a fresh access token. Returns
 * null on any rejection (expired/revoked refresh token) — the caller then
 * clears both tokens and the session is signed out.
 */
export async function refreshTokens(
  refreshToken: string,
  issuer: string = issuerBase(),
): Promise<TokenResponse | null> {
  const res = await fetch(oidcEndpoint(issuer, 'token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ssoClientId(),
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) return null
  return (await res.json()) as TokenResponse
}
