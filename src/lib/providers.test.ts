import { describe, expect, it } from 'vitest'

import { BifrostApiError } from './api'
import {
  fallbackProviders,
  loginErrorMessage,
  parseProviders,
  planSignOut,
} from './providers'

describe('parseProviders', () => {
  it('parses local-only', () => {
    expect(parseProviders({ local: true, oidc: null })).toEqual({
      local: true,
      oidc: null,
    })
  })

  it('parses oidc-only with the backend-reported issuer', () => {
    expect(
      parseProviders({
        local: false,
        oidc: { issuer: 'http://localhost:8090/realms/mobula' },
      }),
    ).toEqual({ local: false, oidc: { issuer: 'http://localhost:8090/realms/mobula' } })
  })

  it('parses both methods at once', () => {
    expect(
      parseProviders({ local: true, oidc: { issuer: 'https://idp.example.com' } }),
    ).toEqual({ local: true, oidc: { issuer: 'https://idp.example.com' } })
  })

  it('degrades field by field on mis-typed values and ignores extras', () => {
    expect(
      parseProviders({ local: 'yes', oidc: { issuer: 42 }, extra: true }),
    ).toEqual({ local: false, oidc: null })
  })

  it('rejects non-object bodies so the caller falls back', () => {
    expect(parseProviders(null)).toBeNull()
    expect(parseProviders('local')).toBeNull()
    expect(parseProviders(undefined)).toBeNull()
  })
})

describe('fallbackProviders (older backend, no /auth/providers)', () => {
  it('offers SSO when VITE_MOBULA_ISSUER is explicitly set', () => {
    expect(fallbackProviders('https://idp.example.com')).toEqual({
      local: false,
      oidc: { issuer: 'https://idp.example.com' },
    })
  })

  it('offers nothing (paste-token only) when the env var is unset or empty', () => {
    expect(fallbackProviders(undefined)).toEqual({ local: false, oidc: null })
    expect(fallbackProviders('')).toEqual({ local: false, oidc: null })
  })
})

describe('loginErrorMessage', () => {
  it('maps the uniform 401 invalid_credentials to a neutral message', () => {
    // Unknown user / wrong password / locked are indistinguishable by
    // design (api-v1.md §5.15) — the message must not speculate.
    const err = new BifrostApiError({
      kind: 'http',
      status: 401,
      message: 'invalid_credentials',
    })
    expect(loginErrorMessage(err)).toBe('Invalid username or password.')
  })

  it('maps an unreachable control plane distinctly', () => {
    const err = new BifrostApiError({ kind: 'network', status: 0, message: 'down' })
    expect(loginErrorMessage(err)).toBe('Cannot reach the Bifrost control plane.')
  })

  it('falls back to a generic message for other failures', () => {
    expect(
      loginErrorMessage(
        new BifrostApiError({ kind: 'http', status: 500, message: 'boom' }),
      ),
    ).toBe('Sign-in failed. Try again.')
    expect(loginErrorMessage(new Error('weird'))).toBe('Sign-in failed. Try again.')
  })
})

describe('planSignOut', () => {
  it('SSO sessions redirect through the issuer logout', () => {
    expect(planSignOut('sso')).toEqual({ kind: 'sso-logout' })
  })

  it('local sessions revoke the PAT server-side before clearing', () => {
    expect(planSignOut('local')).toEqual({ kind: 'local-logout' })
  })

  it('paste/dev/none sessions just clear', () => {
    expect(planSignOut('pat')).toEqual({ kind: 'clear' })
    expect(planSignOut('dev')).toEqual({ kind: 'clear' })
    expect(planSignOut('none')).toEqual({ kind: 'clear' })
  })
})
