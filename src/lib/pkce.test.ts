import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PkceState } from './pkce'
import {
  PKCE_STORAGE_KEY,
  DEFAULT_SSO_CLIENT_ID,
  buildAuthorizeUrl,
  buildLogoutUrl,
  consumePkceState,
  exchangeCodeForTokens,
  generateState,
  generateVerifier,
  loadPkceState,
  refreshTokens,
  s256Challenge,
  ssoClientId,
  storePkceState,
} from './pkce'

const ISSUER = 'http://localhost:8090/realms/mobula'

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

const ENTRY: PkceState = {
  state: 'state-123',
  verifier: 'verifier-abc',
  returnTo: '/pools',
  issuer: ISSUER,
}

describe('generateVerifier / generateState', () => {
  it('generates a 64-char url-safe verifier, unique per call', () => {
    const a = generateVerifier()
    const b = generateVerifier()
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(b).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(a).not.toBe(b)
  })

  it('generates a url-safe state token, unique per call', () => {
    const a = generateState()
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a).not.toBe(generateState())
  })
})

describe('s256Challenge', () => {
  it('matches the RFC 7636 appendix B test vector', async () => {
    await expect(
      s256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('produces a 43-char base64url challenge', async () => {
    await expect(s256Challenge(generateVerifier())).resolves.toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    )
  })
})

describe('buildAuthorizeUrl', () => {
  it('builds the authcode+PKCE authorize URL with all params encoded', () => {
    const url = new URL(
      buildAuthorizeUrl({
        issuer: ISSUER,
        clientId: 'mobula',
        redirectUri: 'http://localhost:5173/auth/callback',
        state: 'st',
        codeChallenge: 'ch',
      }),
    )
    expect(url.origin + url.pathname).toBe(
      `${ISSUER}/protocol/openid-connect/auth`,
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('mobula')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/auth/callback',
    )
    expect(url.searchParams.get('scope')).toBe('openid')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('code_challenge')).toBe('ch')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('omits the prompt parameter by default (explicit sign-in clicks)', () => {
    const url = new URL(
      buildAuthorizeUrl({
        issuer: ISSUER,
        clientId: 'mobula',
        redirectUri: 'http://localhost:5173/auth/callback',
        state: 'st',
        codeChallenge: 'ch',
      }),
    )
    expect(url.searchParams.has('prompt')).toBe(false)
  })

  it('appends prompt=none for the silent auto-SSO attempt', () => {
    const url = new URL(
      buildAuthorizeUrl({
        issuer: ISSUER,
        clientId: 'mobula',
        redirectUri: 'http://localhost:5173/auth/callback',
        state: 'st',
        codeChallenge: 'ch',
        prompt: 'none',
      }),
    )
    expect(url.searchParams.get('prompt')).toBe('none')
    // The silent attempt is otherwise the standard authcode+PKCE request.
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('tolerates a trailing slash on the issuer', () => {
    const url = buildAuthorizeUrl({
      issuer: `${ISSUER}/`,
      clientId: 'mobula',
      redirectUri: 'http://localhost:8088/auth/callback',
      state: 'st',
      codeChallenge: 'ch',
    })
    expect(url).toContain(`${ISSUER}/protocol/openid-connect/auth?`)
  })
})

describe('buildLogoutUrl', () => {
  it('builds the logout URL with post-logout redirect and client id', () => {
    const url = new URL(
      buildLogoutUrl({
        issuer: ISSUER,
        clientId: 'mobula',
        postLogoutRedirectUri: 'http://localhost:5173/',
      }),
    )
    expect(url.origin + url.pathname).toBe(
      `${ISSUER}/protocol/openid-connect/logout`,
    )
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:5173/',
    )
    expect(url.searchParams.get('client_id')).toBe('mobula')
  })
})

describe('PKCE state stash', () => {
  it('round-trips a stored entry', () => {
    const storage = fakeStorage()
    storePkceState(ENTRY, storage)
    expect(loadPkceState(storage)).toEqual(ENTRY)
  })

  it('returns null for missing or malformed stored JSON', () => {
    const storage = fakeStorage()
    expect(loadPkceState(storage)).toBeNull()
    storage.setItem(PKCE_STORAGE_KEY, 'not json')
    expect(loadPkceState(storage)).toBeNull()
    storage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ state: 1 }))
    expect(loadPkceState(storage)).toBeNull()
  })

  it('consume returns the entry on a state match and clears it', () => {
    const storage = fakeStorage()
    storePkceState(ENTRY, storage)
    expect(consumePkceState('state-123', storage)).toEqual(ENTRY)
    expect(loadPkceState(storage)).toBeNull()
  })

  it('consume rejects a tampered state and still clears the stash', () => {
    const storage = fakeStorage()
    storePkceState(ENTRY, storage)
    expect(consumePkceState('forged-state', storage)).toBeNull()
    expect(loadPkceState(storage)).toBeNull()
  })

  it('consume rejects when nothing was stored', () => {
    expect(consumePkceState('state-123', fakeStorage())).toBeNull()
  })
})

describe('token endpoint calls', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('exchangeCodeForTokens posts the authorization_code grant', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: 'at', refresh_token: 'rt' }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const tokens = await exchangeCodeForTokens(
      'code-1',
      ENTRY,
      'http://localhost:5173/auth/callback',
    )
    expect(tokens).toEqual({ access_token: 'at', refresh_token: 'rt' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${ISSUER}/protocol/openid-connect/token`)
    expect(init.method).toBe('POST')
    const body = new URLSearchParams(init.body as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_id')).toBe('mobula')
    expect(body.get('redirect_uri')).toBe('http://localhost:5173/auth/callback')
    expect(body.get('code')).toBe('code-1')
    expect(body.get('code_verifier')).toBe('verifier-abc')
  })

  it('exchangeCodeForTokens throws on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 400 })))
    await expect(
      exchangeCodeForTokens('code-1', ENTRY, 'http://localhost:5173/auth/callback'),
    ).rejects.toThrow('Token exchange failed: 400')
  })

  it('refreshTokens posts the refresh_token grant and returns null on rejection', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'at2' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(refreshTokens('rt')).resolves.toEqual({ access_token: 'at2' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${ISSUER}/protocol/openid-connect/token`)
    const body = new URLSearchParams(init.body as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('rt')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('expired', { status: 400 })))
    await expect(refreshTokens('rt')).resolves.toBeNull()
  })

  it('targets the session issuer when one is supplied', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'at3' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await refreshTokens('rt', 'https://idp.example.com/realms/prod')
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://idp.example.com/realms/prod/protocol/openid-connect/token')
  })
})

describe('ssoClientId (per-deployment OIDC client)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to the demo realm client when nothing is injected', () => {
    expect(ssoClientId()).toBe(DEFAULT_SSO_CLIENT_ID)
  })

  it('uses an operator-provisioned client id when one is injected', () => {
    // Nebari's operator derives <namespace>-<nebariapp-name>; the point of the
    // override is that we cannot know this string at build time.
    vi.stubEnv('VITE_BIFROST_SSO_CLIENT_ID', 'bifrost-bifrost-ui-spa')
    expect(ssoClientId()).toBe('bifrost-bifrost-ui-spa')
  })

  it('ignores an empty value rather than authenticating as the empty client', () => {
    vi.stubEnv('VITE_BIFROST_SSO_CLIENT_ID', '')
    expect(ssoClientId()).toBe(DEFAULT_SSO_CLIENT_ID)
  })

  it('reaches the authorize URL, which is the reason it is overridable', () => {
    vi.stubEnv('VITE_BIFROST_SSO_CLIENT_ID', 'bifrost-bifrost-ui-spa')
    const url = new URL(
      buildAuthorizeUrl({
        issuer: ISSUER,
        clientId: ssoClientId(),
        redirectUri: 'http://localhost:5173/auth/callback',
        state: 'st',
        codeChallenge: 'ch',
      }),
    )
    expect(url.searchParams.get('client_id')).toBe('bifrost-bifrost-ui-spa')
  })

  it('is read per call, not frozen at module load', () => {
    vi.stubEnv('VITE_BIFROST_SSO_CLIENT_ID', 'first-client')
    expect(ssoClientId()).toBe('first-client')
    vi.stubEnv('VITE_BIFROST_SSO_CLIENT_ID', 'second-client')
    expect(ssoClientId()).toBe('second-client')
  })
})
