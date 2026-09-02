import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_ISSUER, issuerBase } from './auth-token'
import { DEFAULT_SSO_CLIENT_ID, ssoClientId } from './pkce'
import {
  loadRuntimeConfig,
  parseRuntimeConfig,
  runtimeConfig,
  setRuntimeConfigForTests,
} from './runtime-config'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('runtime config', () => {
  afterEach(() => setRuntimeConfigForTests({}))

  it('accepts only non-empty strings for known keys and trims a trailing slash', () => {
    expect(
      parseRuntimeConfig({ ssoClientId: 'bifrost-bifrost-ui-spa', issuer: 'https://idp/realms/x/', extra: 1 }),
    ).toEqual({ ssoClientId: 'bifrost-bifrost-ui-spa', issuer: 'https://idp/realms/x' })
    expect(parseRuntimeConfig({ ssoClientId: '', issuer: 42 })).toEqual({})
    expect(parseRuntimeConfig(null)).toEqual({})
    expect(parseRuntimeConfig('nope')).toEqual({})
  })

  it('loads /config.json and feeds the client id and issuer', async () => {
    const calls: string[] = []
    await loadRuntimeConfig(async (input) => {
      calls.push(String(input))
      return jsonResponse({ ssoClientId: 'deployed-spa', issuer: 'https://kc.example/realms/nebari' })
    })
    expect(calls).toEqual(['/config.json'])
    expect(runtimeConfig()).toEqual({ ssoClientId: 'deployed-spa', issuer: 'https://kc.example/realms/nebari' })
    expect(ssoClientId()).toBe('deployed-spa')
    expect(issuerBase()).toBe('https://kc.example/realms/nebari')
  })

  it('falls back to the build-time chain on 404, network error or bad JSON', async () => {
    await loadRuntimeConfig(async () => new Response('not found', { status: 404 }))
    expect(runtimeConfig()).toEqual({})
    await loadRuntimeConfig(async () => {
      throw new TypeError('offline')
    })
    expect(runtimeConfig()).toEqual({})
    await loadRuntimeConfig(async () => new Response('<html>', { status: 200 }))
    expect(runtimeConfig()).toEqual({})
    expect(ssoClientId()).toBe(import.meta.env.VITE_BIFROST_SSO_CLIENT_ID || DEFAULT_SSO_CLIENT_ID)
    expect(issuerBase()).toBe(import.meta.env.VITE_BIFROST_ISSUER || DEFAULT_ISSUER)
  })
})
