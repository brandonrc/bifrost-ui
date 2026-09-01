import { useQuery } from '@tanstack/react-query'
import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { issuerBase } from '@/lib/auth-token'
import { ssoClientId, startSsoSignIn } from '@/lib/pkce'
import { fallbackProviders, loginErrorMessage, parseProviders } from '@/lib/providers'

/**
 * Provider-driven sign-in (api-v1.md §5.15): `GET /api/v1/auth/providers`
 * decides what renders — a local username/password form when the backend
 * runs `--local-auth` (ADR-0011), "Sign in with SSO" when OIDC is
 * configured (the backend-reported issuer overrides the VITE default), or
 * both. Backends that predate the endpoint (404) fall back to
 * VITE_BIFROST_ISSUER-based SSO. Paste-a-token stays as a collapsed
 * advanced option for `bifrost token`-minted service tokens.
 */
export function LoginPage() {
  const { identity, signIn, signInLocal } = useAuth()
  const navigate = useNavigate()

  const providersQuery = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.authProviders,
    retry: false,
    staleTime: 60_000,
  })
  const providers = providersQuery.isPending
    ? null
    : (providersQuery.isSuccess ? parseProviders(providersQuery.data) : null) ??
      fallbackProviders(import.meta.env.VITE_BIFROST_ISSUER)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [token, setToken] = useState('')
  const [tokenError, setTokenError] = useState<string | null>(null)

  const submitLocal = async () => {
    setSubmitting(true)
    setLocalError(null)
    try {
      const res = await api.authLogin(username, password)
      signInLocal(
        res.token,
        { subject: res.identity.subject, groups: [], roles: res.identity.roles },
        res.expires_at,
      )
      void navigate('/')
    } catch (err) {
      setLocalError(loginErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const submitToken = () => {
    const result = signIn(token)
    if (result == null) {
      setTokenError(
        'That token is malformed or already expired — paste a complete, unexpired JWT (three dot-separated segments).',
      )
      return
    }
    void navigate('/')
  }

  const ssoIssuer = providers?.oidc?.issuer

  return (
    <>
      <PageHeader
        title="Sign in"
        description="Authenticate against this control plane."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {identity ? (
              <p className="text-sm text-muted-foreground">
                You are signed in as{' '}
                <span className="font-mono text-xs text-foreground">
                  {identity.subject}
                </span>
                .
              </p>
            ) : null}

            {providers == null ? (
              <p className="text-sm text-muted-foreground">
                Detecting sign-in methods…
              </p>
            ) : (
              <>
                {providers.local ? (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void submitLocal()
                    }}
                  >
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username"
                      autoComplete="username"
                      aria-label="Username"
                    />
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      autoComplete="current-password"
                      aria-label="Password"
                    />
                    {localError ? (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {localError}
                      </p>
                    ) : null}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={submitting || username === '' || password === ''}
                    >
                      Sign in
                    </Button>
                  </form>
                ) : null}

                {ssoIssuer != null ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Redirects to the configured issuer (
                      <code className="text-foreground">{ssoIssuer}</code>) and
                      back — Authorization Code + PKCE, no password handled by
                      this app.
                    </p>
                    <Button
                      size="sm"
                      variant={providers.local ? 'outline' : 'default'}
                      onClick={() => void startSsoSignIn('/', ssoIssuer)}
                    >
                      <LogIn className="size-4" aria-hidden />
                      Sign in with SSO
                    </Button>
                  </div>
                ) : null}

                {!providers.local && ssoIssuer == null ? (
                  <p className="text-sm text-muted-foreground">
                    This backend has no login methods configured — use an API
                    token below.
                  </p>
                ) : null}
              </>
            )}

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Advanced: use an API token
              </summary>
              <div className="space-y-3 pt-3">
                <textarea
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value)
                    setTokenError(null)
                  }}
                  rows={5}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="eyJhbGciOiJSUzI1NiIs…"
                  aria-label="Access token"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {tokenError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{tokenError}</p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={submitToken}
                    disabled={token.trim() === ''}
                  >
                    Sign in with token
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/">Cancel</Link>
                  </Button>
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How to get an API token</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              For scripts and service accounts, paste a token above instead of
              signing in interactively.{' '}
              <span className="font-medium text-foreground">CLI:</span> run{' '}
              <code className="text-foreground">bifrost login</code> (device
              flow) and paste the issued access token.
            </p>
            <p>
              <span className="font-medium text-foreground">
                Local Keycloak (password grant):
              </span>{' '}
              the demo stack at <code className="text-foreground">{issuerBase()}</code>{' '}
              has users <code className="text-foreground">admin</code>,{' '}
              <code className="text-foreground">operator</code>,{' '}
              <code className="text-foreground">developer</code>,{' '}
              <code className="text-foreground">viewer</code> (password =
              username):
            </p>
            <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs text-foreground">
{`curl -s ${issuerBase()}/protocol/openid-connect/token \\
  -d grant_type=password -d client_id=${ssoClientId()} \\
  -d username=admin -d password=admin | jq -r .access_token`}
            </pre>
            <p>
              Set <code className="text-foreground">VITE_BIFROST_ISSUER</code> to
              point at a different issuer when the backend does not report one.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
