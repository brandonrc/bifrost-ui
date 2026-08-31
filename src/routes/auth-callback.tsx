import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { clearPkceState, consumePkceState, exchangeCodeForTokens } from '@/lib/pkce'
import { isSilentSsoDenial, markSilentSsoAttempted } from '@/lib/silent-sso'

/**
 * OAuth redirect target (`/auth/callback`, registered on the issuer's
 * public client). Validates `state` against the stashed PKCE entry —
 * a mismatch is a hard stop, never a code exchange — then swaps the
 * authorization code for tokens and lands on the originally intended page.
 */
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  // Run the exchange exactly once: StrictMode double-invokes effects, and
  // signIn re-renders this page — both must not re-consume the code.
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const errorParam = searchParams.get('error')
    if (errorParam != null) {
      // `login_required`/`interaction_required` etc. are the issuer's
      // answer to a silent `prompt=none` attempt with no live IdP session
      // — a benign outcome, not a failure. Keep the guard set so the app
      // doesn't retry in a loop, drop the unused PKCE stash, and land on
      // the login page without a failure card.
      if (isSilentSsoDenial(errorParam)) {
        clearPkceState()
        markSilentSsoAttempted()
        void navigate('/login', { replace: true })
        return
      }
      setError(
        searchParams.get('error_description') ??
          `The issuer returned an error: ${errorParam}`,
      )
      return
    }

    const state = searchParams.get('state')
    const code = searchParams.get('code')
    const entry = state != null ? consumePkceState(state) : null
    if (entry == null || code == null) {
      setError(
        'Invalid or expired sign-in attempt (state mismatch or missing code). Start sign-in again.',
      )
      return
    }

    exchangeCodeForTokens(code, entry)
      .then((tokens) => {
        const identity = signIn(tokens.access_token, {
          refreshToken: tokens.refresh_token,
          kind: 'sso',
          issuer: entry.issuer,
        })
        if (identity == null) {
          setError('The issuer returned an unusable access token.')
          return
        }
        void navigate(entry.returnTo || '/', { replace: true })
      })
      .catch(() => {
        setError('Token exchange failed — the code may have expired. Try signing in again.')
      })
  }, [searchParams, navigate, signIn])

  if (error != null) {
    return (
      <div className="flex items-center justify-center pt-16">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-red-600 dark:text-red-400" aria-hidden />
              Sign-in failed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button asChild size="sm" variant="outline">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <p className="pt-16 text-center text-sm text-muted-foreground">
      Completing sign-in…
    </p>
  )
}
