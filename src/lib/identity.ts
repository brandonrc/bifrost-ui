import type { Identity, Role } from './api'

/**
 * Whether the caller holds any of `roles` — globally, or in any one project.
 *
 * `Identity.roles` carries the caller's *global* roles only. A user whose
 * grant is scoped to a project (the ordinary self-serve case: a group mapped
 * to `operator` on `team-a`, or an assignment written by an administrator)
 * appears there with no roles at all, and every gate written against that
 * field alone told them they lacked a permission the control plane would have
 * honoured.
 *
 * `Identity.projects` is the server's own answer to "where may I act", added
 * in contract 0.3.0. It is optional here because a deployment may run an older
 * control plane, in which case this degrades to the global-roles check it
 * replaced — no worse than before, and better everywhere else.
 */
export function holdsRole(identity: Identity | null, roles: Role[]): boolean {
  if (!identity) return false
  if (roles.some((role) => identity.roles.includes(role))) return true
  return (identity.projects ?? []).some((project) =>
    roles.some((role) => project.roles.includes(role)),
  )
}

/** The projects the caller may act in with any of `roles`, sorted by name. */
export function projectsWithRole(
  identity: Identity | null,
  roles: Role[],
): string[] {
  if (!identity) return []
  return (identity.projects ?? [])
    .filter((project) => roles.some((role) => project.roles.includes(role)))
    .map((project) => project.name)
    .sort()
}
