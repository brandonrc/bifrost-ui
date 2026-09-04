import { describe, expect, it } from 'vitest'

import { holdsRole, projectsWithRole } from './identity'
import { canManageClusters } from './clusters'
import { canManageServices } from './services'
import type { Identity } from './api'

/**
 * Where a grant is held used to decide whether the dashboard believed in it.
 *
 * `Identity.roles` lists the caller's *global* roles. The ordinary self-serve
 * user holds theirs on a project instead — a group mapped to `operator` on
 * `team-a`, or an assignment an administrator wrote — and every gate written
 * against `roles` alone told that user they needed a role they already had.
 * The control plane would have accepted their create; the page never sent it.
 * Caught by driving the dashboard as a project operator in a browser.
 */
const identity = (
  roles: Identity['roles'],
  projects?: Identity['projects'],
): Identity => ({
  subject: 'alice',
  groups: [],
  roles,
  ...(projects ? { projects } : {}),
})

describe('holdsRole', () => {
  it('accepts a global grant', () => {
    expect(holdsRole(identity(['operator']), ['operator', 'admin'])).toBe(true)
  })

  it('accepts a grant held in a project', () => {
    const who = identity([], [{ name: 'team-a', roles: ['operator'] }])
    expect(holdsRole(who, ['operator', 'admin'])).toBe(true)
  })

  it('refuses a role held nowhere', () => {
    const who = identity(['viewer'], [{ name: 'team-a', roles: ['viewer'] }])
    expect(holdsRole(who, ['operator', 'admin'])).toBe(false)
  })

  it('fails closed without an identity', () => {
    expect(holdsRole(null, ['admin'])).toBe(false)
  })

  it('falls back to global roles against a control plane that reports no projects', () => {
    // Contract < 0.3.0 carries no `projects`; the check degrades to what it
    // was rather than locking such a deployment out of its own dashboard.
    expect(holdsRole(identity(['admin']), ['admin'])).toBe(true)
    expect(holdsRole(identity(['developer']), ['operator'])).toBe(false)
  })
})

describe('projectsWithRole', () => {
  it('names the projects a role is held in, sorted', () => {
    const who = identity(
      [],
      [
        { name: 'team-b', roles: ['operator'] },
        { name: 'team-a', roles: ['admin'] },
        { name: 'team-c', roles: ['viewer'] },
      ],
    )
    expect(projectsWithRole(who, ['operator', 'admin'])).toEqual([
      'team-a',
      'team-b',
    ])
  })

  it('is empty when nothing is held', () => {
    expect(projectsWithRole(identity(['admin']), ['operator'])).toEqual([])
    expect(projectsWithRole(null, ['admin'])).toEqual([])
  })
})

describe('the gates that used to read global roles only', () => {
  it('lets a project operator manage clusters', () => {
    const who = identity([], [{ name: 'team-a', roles: ['operator'] }])
    expect(canManageClusters(who)).toBe(true)
  })

  it('lets a project developer manage services', () => {
    const who = identity([], [{ name: 'team-a', roles: ['developer'] }])
    expect(canManageServices(who)).toBe(true)
  })

  it('still refuses a viewer, wherever the grant sits', () => {
    expect(
      canManageClusters(identity([], [{ name: 'team-a', roles: ['viewer'] }])),
    ).toBe(false)
    expect(canManageClusters(identity(['viewer']))).toBe(false)
  })
})
