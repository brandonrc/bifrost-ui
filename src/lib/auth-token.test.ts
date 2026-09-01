import { describe, expect, it } from 'vitest'

import type { Identity } from './api'
import {
  decodeJwtPayload,
  getCurrentToken,
  identityFromToken,
  isPayloadExpired,
  resolveSession,
  rolesFromGroups,
  setCurrentToken,
  withReportedRoles,
} from './auth-token'

/** Mint an unsigned JWT-shaped token (client never verifies signatures). */
function mint(payload: unknown): string {
  const enc = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(payload)}.sig`
}

const NOW = 1_755_366_400_000 // ms

const FUTURE = Math.floor(NOW / 1000) + 3_600 // exp, unix seconds
const PAST = Math.floor(NOW / 1000) - 3_600

describe('decodeJwtPayload', () => {
  it('decodes a valid payload', () => {
    const payload = decodeJwtPayload(mint({ sub: 'u1', exp: FUTURE }))
    expect(payload).toEqual({ sub: 'u1', exp: FUTURE })
  })

  it('rejects tokens that are not three segments', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
    expect(decodeJwtPayload('two.parts')).toBeNull()
    expect(decodeJwtPayload('')).toBeNull()
  })

  it('rejects a payload that is not valid base64url JSON', () => {
    expect(decodeJwtPayload('a.!!!.b')).toBeNull()
    expect(decodeJwtPayload('a.bm90LWpzb24.b')).toBeNull() // "not-json"
  })

  it('rejects a JSON payload that is not an object', () => {
    expect(decodeJwtPayload(mint(['admin']))).toBeNull()
    expect(decodeJwtPayload(mint('admin'))).toBeNull()
    expect(decodeJwtPayload(mint(null))).toBeNull()
  })
})

describe('isPayloadExpired', () => {
  it('treats exp in the past as expired and in the future as live', () => {
    expect(isPayloadExpired({ exp: PAST }, NOW)).toBe(true)
    expect(isPayloadExpired({ exp: FUTURE }, NOW)).toBe(false)
  })

  it('treats a missing or non-numeric exp as non-expiring client-side', () => {
    expect(isPayloadExpired({}, NOW)).toBe(false)
    expect(isPayloadExpired({ exp: 'soon' }, NOW)).toBe(false)
  })
})

describe('rolesFromGroups', () => {
  it('maps each Keycloak demo group to its role (auth.toml)', () => {
    expect(rolesFromGroups(['/platform-admins'])).toEqual(['admin'])
    expect(rolesFromGroups(['/sre'])).toEqual(['operator'])
    expect(rolesFromGroups(['/ml-eng'])).toEqual(['developer'])
    expect(rolesFromGroups(['/observers'])).toEqual(['viewer'])
  })

  it('unions multiple groups, most privileged first, ignoring unknowns', () => {
    expect(rolesFromGroups(['/ml-eng', '/sre', '/unrelated'])).toEqual([
      'operator',
      'developer',
    ])
    expect(rolesFromGroups(['/unrelated'])).toEqual([])
    expect(rolesFromGroups([])).toEqual([])
  })
})

describe('withReportedRoles', () => {
  const base: Identity = {
    subject: 'admin',
    email: 'admin@example.com',
    groups: ['bifrost-admins', 'team-a'],
    roles: [], // client-side parse missed the deployment's group names
  }

  it('adopts the backend-reported roles over the session identity', () => {
    const reported: Identity = {
      subject: 'a1b2-uuid',
      groups: ['bifrost-admins'],
      roles: ['admin'],
    }
    expect(withReportedRoles(base, reported)).toEqual({
      subject: 'admin',
      email: 'admin@example.com',
      groups: ['bifrost-admins', 'team-a'],
      roles: ['admin'], // authorization comes from the server
    })
  })

  it('keeps display fields (subject, email, groups) from the token', () => {
    const merged = withReportedRoles(base, {
      subject: 'uuid',
      groups: [],
      roles: ['operator', 'developer'],
    })
    expect(merged.subject).toBe('admin')
    expect(merged.email).toBe('admin@example.com')
    expect(merged.groups).toEqual(['bifrost-admins', 'team-a'])
    expect(merged.roles).toEqual(['operator', 'developer'])
  })

  it('falls back to the provisional roles when the server has not answered', () => {
    const provisional: Identity = { ...base, roles: ['viewer'] }
    expect(withReportedRoles(provisional, null)).toBe(provisional)
    expect(withReportedRoles(provisional, undefined)).toBe(provisional)
  })

  it('demotes correctly: an empty reported role set removes access', () => {
    const provisional: Identity = { ...base, roles: ['admin'] }
    expect(withReportedRoles(provisional, { ...base, roles: [] }).roles).toEqual(
      [],
    )
  })
})

describe('identityFromToken', () => {
  it('builds the identity from claims, preferring preferred_username for display', () => {
    const identity = identityFromToken(
      mint({
        sub: '9f2c-uuid',
        preferred_username: 'admin',
        email: 'admin@mobula.local',
        groups: ['/platform-admins'],
        exp: FUTURE,
      }),
      NOW,
    )
    expect(identity).toEqual({
      subject: 'admin',
      email: 'admin@mobula.local',
      groups: ['/platform-admins'],
      roles: ['admin'],
    })
  })

  it('falls back to sub and tolerates missing email/groups', () => {
    const identity = identityFromToken(mint({ sub: 'u1', exp: FUTURE }), NOW)
    expect(identity).toEqual({
      subject: 'u1',
      email: undefined,
      groups: [],
      roles: [],
    })
  })

  it('returns null for expired or malformed tokens', () => {
    expect(identityFromToken(mint({ sub: 'u1', exp: PAST }), NOW)).toBeNull()
    expect(identityFromToken('garbage', NOW)).toBeNull()
  })
})

const DEV_IDENTITY: Identity = {
  subject: 'dev-admin@mobula.local',
  email: 'dev-admin@mobula.local',
  groups: ['platform-admins'],
  roles: ['admin'],
}

describe('resolveSession precedence', () => {
  const viewerToken = mint({
    sub: 'viewer',
    groups: ['/observers'],
    exp: FUTURE,
  })

  it('token beats the dev stub', () => {
    const session = resolveSession({ token: viewerToken, devIdentity: DEV_IDENTITY, now: NOW })
    expect(session.source).toBe('pat')
    expect(session.token).toBe(viewerToken)
    expect(session.identity?.roles).toEqual(['viewer'])
  })

  it('an SSO token (meta kind sso) reports the sso source', () => {
    const session = resolveSession({
      token: viewerToken,
      meta: { kind: 'sso', issuer: 'http://localhost:8090/realms/mobula' },
      now: NOW,
    })
    expect(session.source).toBe('sso')
    expect(session.identity?.subject).toBe('viewer')
  })

  it('an opaque local-auth token uses the login-time identity from meta', () => {
    const identity: Identity = { subject: 'admin', groups: [], roles: ['admin'] }
    const session = resolveSession({
      token: 'bfr_a1b2c3d4_deadbeef',
      meta: { kind: 'local', identity, expiresAt: FUTURE },
      now: NOW,
    })
    expect(session).toEqual({ token: 'bfr_a1b2c3d4_deadbeef', identity, source: 'local' })
  })

  it('an opaque token without a stored identity is not a session', () => {
    expect(resolveSession({ token: 'bfr_a1b2c3d4_deadbeef', now: NOW })).toEqual({
      token: null,
      identity: null,
      source: 'none',
    })
    expect(
      resolveSession({
        token: 'bfr_a1b2c3d4_deadbeef',
        meta: { kind: 'local' },
        now: NOW,
      }).source,
    ).toBe('none')
  })

  it('dev stub is used when there is no token', () => {
    const session = resolveSession({ token: null, devIdentity: DEV_IDENTITY, now: NOW })
    expect(session).toEqual({ token: null, identity: DEV_IDENTITY, source: 'dev' })
  })

  it('an expired token falls through to the dev stub, else signed out', () => {
    const expired = mint({ sub: 'viewer', exp: PAST })
    expect(
      resolveSession({ token: expired, devIdentity: DEV_IDENTITY, now: NOW }).source,
    ).toBe('dev')
    expect(resolveSession({ token: expired, now: NOW })).toEqual({
      token: null,
      identity: null,
      source: 'none',
    })
  })

  it('no token and no dev stub is signed out', () => {
    expect(resolveSession({ now: NOW })).toEqual({
      token: null,
      identity: null,
      source: 'none',
    })
  })
})

describe('token store', () => {
  it('holds the current token in memory and clears it (no localStorage in node)', () => {
    setCurrentToken(mint({ sub: 'u1', exp: FUTURE }))
    expect(getCurrentToken()).not.toBeNull()
    setCurrentToken(null)
    expect(getCurrentToken()).toBeNull()
  })
})
