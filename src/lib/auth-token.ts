import type { Identity, Role } from './api'

/**
 * Manual token sign-in (interim auth, pending the PKCE endpoints in
 * api-v1.md §5.11). A pasted JWT becomes the session: it is stored in
 * localStorage, decoded client-side for display identity + roles, and sent
 * as `Authorization: Bearer` on every API call.
 *
 * The payload is decoded WITHOUT signature verification — that is
 * deliberate. The backend validates the JWT (RS256 against the issuer's
 * JWKS) on every request; the client-side decode only shapes the UI (who
 * is shown in the identity chip, which affordances render). A forged token
 * can lie to the UI but gets 401/403 from the API.
 */

export const TOKEN_STORAGE_KEY = 'bifrost.token'
export const REFRESH_TOKEN_STORAGE_KEY = 'bifrost.refresh_token'
export const SESSION_META_STORAGE_KEY = 'bifrost.session'

/**
 * Dispatched on `window` when the API answers 401 to an authenticated
 * request — the token we hold is expired or revoked, so the session is
 * cleared and the UI routes to sign-in.
 */
export const SESSION_EXPIRED_EVENT = 'bifrost:session-expired'

/** Default local Keycloak issuer; override with VITE_BIFROST_ISSUER. */
export const DEFAULT_ISSUER = 'http://localhost:8090/realms/mobula'

export function issuerBase(): string {
  return import.meta.env.VITE_BIFROST_ISSUER || DEFAULT_ISSUER
}

/**
 * Group path → role, a BEST-EFFORT fallback only. This mirrors the local
 * demo's `deploy/keycloak/auth.toml`, but the group→role mapping is
 * per-deployment (a real cluster's realm uses its own group names, e.g.
 * `bifrost-admins`), so this static map cannot be correct everywhere and
 * MUST NOT be the authority on the caller's role.
 *
 * The single source of truth is the backend: `GET /api/v1/identity` returns
 * the roles the server computed from the deployment's own auth config, and
 * `AuthProvider` overlays those onto the session identity (see
 * `withReportedRoles`). This map only supplies a provisional role before
 * that response arrives (and on older backends that lack the endpoint); it
 * resolves to no roles for any deployment whose groups it doesn't list,
 * which fails closed until the backend answers.
 */
const GROUP_ROLE_MAP: Record<string, Role> = {
  '/platform-admins': 'admin',
  '/sre': 'operator',
  '/ml-eng': 'developer',
  '/observers': 'viewer',
}

/** Display order, most privileged first (purely cosmetic). */
const ROLE_ORDER: readonly Role[] = ['admin', 'operator', 'developer', 'viewer']

/** Map IdP group paths to Mobula roles; unknown groups are ignored. */
export function rolesFromGroups(groups: readonly string[]): Role[] {
  const held = new Set<Role>()
  for (const group of groups) {
    const role = GROUP_ROLE_MAP[group]
    if (role) held.add(role)
  }
  return ROLE_ORDER.filter((role) => held.has(role))
}

function base64UrlDecode(segment: string): string | null {
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const binary = atob(padded)
    // atob returns a binary string; go through bytes so UTF-8 claim
    // values (names, emails) decode correctly.
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/**
 * Decode a JWT's payload claims without verifying the signature (the
 * backend verifies; see the module note). Returns null for anything that
 * is not a three-segment JWT with a JSON object payload.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const json = base64UrlDecode(parts[1])
  if (json == null) return null
  try {
    const payload: unknown = JSON.parse(json)
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return null
    }
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

/** `exp` is unix seconds; a payload without `exp` never expires client-side. */
export function isPayloadExpired(
  payload: Record<string, unknown>,
  now = Date.now(),
): boolean {
  const exp = payload.exp
  if (typeof exp !== 'number') return false
  return exp * 1000 <= now
}

/**
 * Build the display identity from a token, or null when the token is
 * malformed or expired (expired token = signed out). Subject prefers
 * `preferred_username` (Keycloak `sub` is a UUID nobody recognizes);
 * roles come from the `groups` claim via `rolesFromGroups`.
 */
export function identityFromToken(token: string, now = Date.now()): Identity | null {
  const payload = decodeJwtPayload(token)
  if (payload == null || isPayloadExpired(payload, now)) return null
  const groups = Array.isArray(payload.groups)
    ? payload.groups.filter((g): g is string => typeof g === 'string')
    : []
  const subject =
    typeof payload.preferred_username === 'string'
      ? payload.preferred_username
      : typeof payload.sub === 'string'
        ? payload.sub
        : 'unknown'
  return {
    subject,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    groups,
    roles: rolesFromGroups(groups),
  }
}

/**
 * Overlay the backend-reported roles onto a session identity. The backend
 * (`GET /api/v1/identity`) is the single source of truth for roles: it maps
 * the caller's groups to roles via the deployment's own auth config
 * (`auth.toml`), which the client cannot know — `GROUP_ROLE_MAP` only ever
 * matches one deployment's group names. Roles decide what admin UI the
 * caller sees, so they must come from the server, not client-side parsing.
 *
 * Display fields (subject, email, groups) stay from the token decode: the
 * decoded `preferred_username` is friendlier than the backend subject (the
 * raw `sub`, a UUID for Keycloak). When no server identity is available yet
 * (pending, or an older backend without the endpoint) the base identity's
 * provisional roles are kept unchanged.
 */
export function withReportedRoles(
  base: Identity,
  reported: Identity | null | undefined,
): Identity {
  if (reported == null) return base
  return { ...base, roles: reported.roles }
}

export type SessionSource = 'sso' | 'local' | 'pat' | 'dev' | 'none'

/**
 * Session metadata, persisted alongside the token. Local-auth tokens are
 * opaque (`bfr_<prefix>_<hex>`, ADR-0011) — they never decode as JWTs, so
 * the display identity comes from the login response and is stored here.
 * For SSO sessions this records which issuer to refresh/logout against.
 */
export interface SessionMeta {
  kind: 'sso' | 'local' | 'pat'
  /** Present for opaque local-auth tokens only (JWT sessions decode it). */
  identity?: Identity
  /** The issuer an SSO session belongs to (refresh + logout target). */
  issuer?: string
  /** Informational, from the local login response (`expires_at`, unix secs). */
  expiresAt?: number
}

export interface Session {
  /** The raw bearer when source is sso/local/pat; null otherwise. */
  token: string | null
  identity: Identity | null
  source: SessionSource
}

/**
 * Session precedence: a valid token wins — JWTs (SSO or pasted) decode
 * client-side, opaque local-auth tokens use the login-time identity stored
 * in the session meta; with no usable token the dev-auth stub keeps the
 * unauthenticated demo stack working; otherwise signed out. An expired JWT
 * falls through to the next tier (silent refresh may still rescue an SSO
 * session) rather than producing a half-valid session.
 */
export function resolveSession(options: {
  token?: string | null
  meta?: SessionMeta | null
  devIdentity?: Identity | null
  now?: number
}): Session {
  const { token = null, meta = null, devIdentity = null, now = Date.now() } = options
  if (token != null && token !== '') {
    const decoded = identityFromToken(token, now)
    if (decoded != null) {
      return { token, identity: decoded, source: meta?.kind === 'sso' ? 'sso' : 'pat' }
    }
    if (meta?.kind === 'local' && meta.identity != null) {
      return { token, identity: meta.identity, source: 'local' }
    }
  }
  if (devIdentity != null) {
    return { token: null, identity: devIdentity, source: 'dev' }
  }
  return { token: null, identity: null, source: 'none' }
}

// ---------------------------------------------------------------------------
// Token store: module-level current token + localStorage persistence.
// Kept here (not in React state) so `src/lib/api.ts` can read the token
// outside the component tree without a circular import on auth-context.
// ---------------------------------------------------------------------------

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && window.localStorage != null
}

// Session meta is loaded before the token because loadStoredToken consults
// it: opaque local-auth tokens only count as a session when a login-time
// identity was stored.
function loadSessionMeta(): SessionMeta | null {
  if (!storageAvailable()) return null
  const raw = window.localStorage.getItem(SESSION_META_STORAGE_KEY)
  if (raw == null || raw === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    if (!['sso', 'local', 'pat'].includes(record.kind as string)) return null
    return parsed as SessionMeta
  } catch {
    return null
  }
}

let currentMeta: SessionMeta | null = loadSessionMeta()

/** Metadata for the current session (kind, SSO issuer, local identity). */
export function getSessionMeta(): SessionMeta | null {
  return currentMeta
}

/** Set or clear (null) the session meta, persisting to localStorage. */
export function setSessionMeta(meta: SessionMeta | null): void {
  currentMeta = meta
  if (!storageAvailable()) return
  if (meta != null) {
    window.localStorage.setItem(SESSION_META_STORAGE_KEY, JSON.stringify(meta))
  } else {
    window.localStorage.removeItem(SESSION_META_STORAGE_KEY)
  }
}

function loadStoredToken(): string | null {
  if (!storageAvailable()) return null
  const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY)
  if (stored == null || stored === '') return null
  // A stored token that no longer yields a session (expired JWT since the
  // last visit; garbage) is dropped so it isn't sent as a dead bearer on
  // every request. Opaque local-auth tokens survive via the meta identity;
  // an expired SSO JWT drops here but the refresh token + meta issuer stay
  // for silent refresh.
  if (identityFromToken(stored) == null && currentMeta?.identity == null) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    return null
  }
  return stored
}

let currentToken: string | null = loadStoredToken()

/** The token to send on API requests right now (null = anonymous). */
export function getCurrentToken(): string | null {
  return currentToken
}

/** Set or clear (null) the session token, persisting to localStorage. */
export function setCurrentToken(token: string | null): void {
  currentToken = token
  if (!storageAvailable()) return
  if (token != null) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

// Refresh tokens are opaque to the UI (no client-side decode/expiry check —
// the issuer's answer to `grant_type=refresh_token` is the check), so unlike
// the access token they load verbatim.
let currentRefreshToken: string | null = storageAvailable()
  ? window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  : null

/** The SSO refresh token, if the session came with one (null otherwise). */
export function getRefreshToken(): string | null {
  return currentRefreshToken
}

/** Set or clear (null) the refresh token, persisting to localStorage. */
export function setRefreshToken(token: string | null): void {
  currentRefreshToken = token
  if (!storageAvailable()) return
  if (token != null) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token)
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  }
}

/** Notify the app that the held token was rejected (401); see auth-context. */
export function notifySessionExpired(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
}
