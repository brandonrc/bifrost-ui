import type { AccessRolesResponse, Role, RoleMappingsView } from './api'
import type { AuthProviders } from './providers'

/**
 * Access page (api-v1.md §5.8) pure logic: which sections render, how the
 * role-mappings response shapes into rows, and the new-user form's
 * client-side validation (mirroring the backend's 400s so they render
 * inline before the round trip; the server stays authoritative).
 */

/** The four built-in roles, select/display order (least privileged first). */
export const ACCESS_ROLES: readonly Role[] = [
  'viewer',
  'developer',
  'operator',
  'admin',
]

export interface AccessSections {
  /** Role-mappings card: Admin-only; non-admins never see a 403 box. */
  roleMappings: boolean
  /**
   * Users section: 'table' when local auth is on (users are managed here),
   * 'oidc-note' when providers are known and local is off, 'hidden' while
   * providers are unknown (pending/unreachable/older backend).
   */
  users: 'table' | 'oidc-note' | 'hidden'
}

/** Section visibility from the caller's admin-ness + discovered providers. */
export function accessSections(
  isAdmin: boolean,
  providers: AuthProviders | null,
): AccessSections {
  if (!isAdmin) return { roleMappings: false, users: 'hidden' }
  return {
    roleMappings: true,
    users: providers == null ? 'hidden' : providers.local ? 'table' : 'oidc-note',
  }
}

export interface RoleMappingRow {
  role: Role
  groups: string[]
}

/** Mappings → display rows, most privileged first. */
export function roleMappingRows(mappings: RoleMappingsView): RoleMappingRow[] {
  return [
    { role: 'admin', groups: mappings.admin },
    { role: 'operator', groups: mappings.operator },
    { role: 'developer', groups: mappings.developer },
    { role: 'viewer', groups: mappings.viewer },
  ]
}

/**
 * One-line explanation when `mappings` is null: in a pure local-auth
 * deployment roles are a column on the user row, resolved per request —
 * there are no group mappings to show.
 */
export function mappingsNote(source: AccessRolesResponse['source']): string {
  return source === 'local'
    ? 'Roles are assigned directly to local users — this deployment has no group mappings.'
    : 'No role mappings are configured.'
}

// --- New-user form -----------------------------------------------------------

export interface UserFormState {
  username: string
  /** Optional on the wire; empty string = unset. */
  email: string
  password: string
  role: Role
}

export function emptyUserForm(): UserFormState {
  return { username: '', email: '', password: '', role: 'viewer' }
}

/** Backend policy (`local_auth.rs::password_ok`). */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Client-side mirror of the backend `IsK8sName` (RFC 1123
 * subdomain): lowercase alphanumerics, `-` and `.`, starts/ends
 * alphanumeric, ≤253 chars. Server stays authoritative; this renders the
 * same 400 inline.
 */
export function isValidUsername(name: string): boolean {
  return name.length >= 1 && name.length <= 253 && /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(name)
}

/** First validation error, or null. Messages mirror the backend's 400s. */
export function validateUserForm(form: UserFormState): string | null {
  if (!isValidUsername(form.username)) {
    return 'username must be a valid Kubernetes name (RFC 1123 subdomain)'
  }
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return 'password must be at least 8 characters'
  }
  if (!ACCESS_ROLES.includes(form.role)) {
    return `role must be one of: ${ACCESS_ROLES.join(', ')}`
  }
  return null
}

/** `created_at` (unix seconds) → locale date for the users table. */
export function formatCreatedAt(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleDateString()
}
