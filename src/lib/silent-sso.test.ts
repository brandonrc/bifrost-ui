import { describe, expect, it } from 'vitest'

import type { AuthProviders } from './providers'
import {
  SILENT_SSO_ATTEMPTED_KEY,
  clearSilentSsoAttempt,
  isSilentSsoDenial,
  markSilentSsoAttempted,
  silentSsoIssuer,
  wasSilentSsoAttempted,
} from './silent-sso'

const ISSUER = 'http://localhost:8090/realms/bifrost'

const OIDC_PROVIDERS: AuthProviders = { local: false, oidc: { issuer: ISSUER } }

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage
}

/** All conditions favourable: signed out, OIDC issuer, first attempt. */
function eligible(): Parameters<typeof silentSsoIssuer>[0] {
  return {
    providers: OIDC_PROVIDERS,
    signedIn: false,
    hasRefreshToken: false,
    pathname: '/',
    attempted: false,
  }
}

describe('attempt guard (sessionStorage)', () => {
  it('marks, reads back, and clears the attempt flag', () => {
    const storage = fakeStorage()
    expect(wasSilentSsoAttempted(storage)).toBe(false)
    markSilentSsoAttempted(storage, 1_700_000_000_000)
    expect(wasSilentSsoAttempted(storage)).toBe(true)
    expect(storage.getItem(SILENT_SSO_ATTEMPTED_KEY)).toBe('1700000000000')
    clearSilentSsoAttempt(storage)
    expect(wasSilentSsoAttempted(storage)).toBe(false)
  })

  it('tolerates an unavailable storage (undefined)', () => {
    expect(wasSilentSsoAttempted(undefined)).toBe(false)
    expect(() => markSilentSsoAttempted(undefined)).not.toThrow()
    expect(() => clearSilentSsoAttempt(undefined)).not.toThrow()
  })
})

describe('isSilentSsoDenial', () => {
  it('recognises the prompt=none interaction errors', () => {
    expect(isSilentSsoDenial('login_required')).toBe(true)
    expect(isSilentSsoDenial('interaction_required')).toBe(true)
    expect(isSilentSsoDenial('consent_required')).toBe(true)
    expect(isSilentSsoDenial('account_selection_required')).toBe(true)
  })

  it('treats every other error (and no error) as a real failure', () => {
    expect(isSilentSsoDenial('access_denied')).toBe(false)
    expect(isSilentSsoDenial('invalid_request')).toBe(false)
    expect(isSilentSsoDenial(null)).toBe(false)
    expect(isSilentSsoDenial(undefined)).toBe(false)
  })
})

describe('silentSsoIssuer', () => {
  it('fires for a signed-out first visit when the backend reports OIDC', () => {
    expect(silentSsoIssuer(eligible())).toBe(ISSUER)
  })

  it('fires from any route, including /login (deep links covered)', () => {
    expect(silentSsoIssuer({ ...eligible(), pathname: '/login' })).toBe(ISSUER)
    expect(silentSsoIssuer({ ...eligible(), pathname: '/pools' })).toBe(ISSUER)
  })

  it('never fires twice in a tab: a prior attempt suppresses it', () => {
    expect(silentSsoIssuer({ ...eligible(), attempted: true })).toBeNull()
  })

  it('does not fire when somebody is already signed in (any source)', () => {
    expect(silentSsoIssuer({ ...eligible(), signedIn: true })).toBeNull()
  })

  it('defers to silent refresh when a refresh token is stored', () => {
    expect(silentSsoIssuer({ ...eligible(), hasRefreshToken: true })).toBeNull()
  })

  it('stays out of the way while /auth/callback processes a code', () => {
    expect(
      silentSsoIssuer({ ...eligible(), pathname: '/auth/callback' }),
    ).toBeNull()
  })

  it('does not fire without an OIDC issuer (local-only, pending, absent)', () => {
    expect(
      silentSsoIssuer({
        ...eligible(),
        providers: { local: true, oidc: null },
      }),
    ).toBeNull()
    expect(silentSsoIssuer({ ...eligible(), providers: null })).toBeNull()
    expect(silentSsoIssuer({ ...eligible(), providers: undefined })).toBeNull()
  })
})
