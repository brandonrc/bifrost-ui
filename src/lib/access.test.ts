import { describe, expect, it } from 'vitest'

import {
  accessSections,
  emptyUserForm,
  isValidUsername,
  mappingsNote,
  roleMappingRows,
  validateUserForm,
} from './access'

describe('accessSections', () => {
  it('hides everything for non-admins, even with local providers', () => {
    expect(accessSections(false, { local: true, oidc: null })).toEqual({
      roleMappings: false,
      users: 'hidden',
    })
  })

  it('admin + local providers → mappings card and the users table', () => {
    expect(accessSections(true, { local: true, oidc: null })).toEqual({
      roleMappings: true,
      users: 'table',
    })
  })

  it('admin + both providers → users table (local and SSO coexist)', () => {
    expect(
      accessSections(true, { local: true, oidc: { issuer: 'https://idp.example.com' } }),
    ).toEqual({ roleMappings: true, users: 'table' })
  })

  it('admin + oidc-only providers → the managed-by-OIDC note', () => {
    expect(
      accessSections(true, { local: false, oidc: { issuer: 'https://idp.example.com' } }),
    ).toEqual({ roleMappings: true, users: 'oidc-note' })
  })

  it('admin + unknown providers (pending/older backend) → users hidden', () => {
    expect(accessSections(true, null)).toEqual({
      roleMappings: true,
      users: 'hidden',
    })
  })
})

describe('roleMappingRows / mappingsNote', () => {
  it('shapes mappings into rows, most privileged first', () => {
    expect(
      roleMappingRows({
        admin: ['/platform-admins'],
        operator: ['/sre'],
        developer: [],
        viewer: ['/observers', '/contractors'],
      }),
    ).toEqual([
      { role: 'admin', groups: ['/platform-admins'] },
      { role: 'operator', groups: ['/sre'] },
      { role: 'developer', groups: [] },
      { role: 'viewer', groups: ['/observers', '/contractors'] },
    ])
  })

  it('explains null mappings in local mode (roles live on user rows)', () => {
    expect(mappingsNote('local')).toContain('local users')
    expect(mappingsNote('file')).not.toContain('local users')
  })
})

describe('isValidUsername (mirrors the backend is_k8s_name)', () => {
  it('accepts RFC 1123 subdomains', () => {
    expect(isValidUsername('admin')).toBe(true)
    expect(isValidUsername('ml-eng.jane')).toBe(true)
    expect(isValidUsername('a')).toBe(true)
  })

  it('rejects uppercase, spaces, bad edges, empty, and >253 chars', () => {
    expect(isValidUsername('Admin')).toBe(false)
    expect(isValidUsername('jane doe')).toBe(false)
    expect(isValidUsername('-jane')).toBe(false)
    expect(isValidUsername('jane-')).toBe(false)
    expect(isValidUsername('')).toBe(false)
    expect(isValidUsername('a'.repeat(254))).toBe(false)
  })
})

describe('validateUserForm', () => {
  it('passes a well-formed form (email optional)', () => {
    expect(
      validateUserForm({ username: 'jane', email: '', password: 'hunter2-hunter', role: 'developer' }),
    ).toBeNull()
  })

  it('mirrors the backend 400 for a bad username', () => {
    expect(
      validateUserForm({ ...emptyUserForm(), username: 'Bad Name', password: 'long-enough' }),
    ).toBe('username must be a valid Kubernetes name (RFC 1123 subdomain)')
  })

  it('mirrors the backend 400 for a short password', () => {
    expect(
      validateUserForm({ ...emptyUserForm(), username: 'jane', password: 'short' }),
    ).toBe('password must be at least 8 characters')
  })

  it('rejects a role outside the four built-ins', () => {
    const form = {
      ...emptyUserForm(),
      username: 'jane',
      password: 'long-enough',
      role: 'superadmin' as never,
    }
    expect(validateUserForm(form)).toBe(
      'role must be one of: viewer, developer, operator, admin',
    )
  })
})
