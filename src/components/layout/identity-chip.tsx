import { CircleUserRound, LogIn, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '@/auth/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, primaryRole, type Role } from '@/lib/api'
import { getSessionMeta, issuerBase, type SessionSource } from '@/lib/auth-token'
import { buildLogoutUrl, ssoClientId } from '@/lib/pkce'
import { planSignOut } from '@/lib/providers'

const ROLE_VARIANT: Record<Role, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  operator: 'secondary',
  developer: 'secondary',
  viewer: 'outline',
} as const

const SOURCE_TITLE: Record<SessionSource, string> = {
  sso: 'Signed in via SSO',
  local: 'Signed in via local auth',
  pat: 'Signed in with a pasted token',
  dev: 'Dev-mode identity (VITE_MOBULA_DEV_AUTH)',
  none: '',
}

/**
 * Top-bar identity/role chip. Shows the session identity and, for
 * token-backed sessions, a sign-out button whose behaviour follows the
 * session source (`planSignOut`): SSO → issuer logout redirect, local →
 * best-effort PAT revocation, paste → clear only. Signed out it links to
 * /login.
 */
export function IdentityChip() {
  const { identity, sessionSource, signOut } = useAuth()
  const navigate = useNavigate()

  if (!identity) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/login">
          <LogIn className="size-4" aria-hidden />
          Sign in
        </Link>
      </Button>
    )
  }

  const plan = planSignOut(sessionSource)

  const handleSignOut = () => {
    const finish = () => {
      signOut()
      if (plan.kind === 'sso-logout') {
        // Kill the issuer session too, then land back on the app signed
        // out (Keycloak honours post_logout_redirect_uri for this client).
        window.location.assign(
          buildLogoutUrl({
            issuer: getSessionMeta()?.issuer ?? issuerBase(),
            clientId: ssoClientId(),
            postLogoutRedirectUri: `${window.location.origin}/`,
          }),
        )
      } else {
        void navigate('/')
      }
    }
    if (plan.kind === 'local-logout') {
      // Best-effort server-side PAT revocation; sign out regardless.
      void api
        .authLogout()
        .catch(() => {})
        .then(finish)
      return
    }
    finish()
  }

  return (
    <div className="flex items-center gap-1">
      <div
        className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs"
        title={SOURCE_TITLE[sessionSource] || undefined}
      >
        <CircleUserRound className="size-4 text-muted-foreground" aria-hidden />
        <span className="max-w-40 truncate">{identity.subject}</span>
        {(() => {
          const role = primaryRole(identity.roles)
          return role ? <Badge variant={ROLE_VARIANT[role]}>{role}</Badge> : null
        })()}
      </div>
      {sessionSource !== 'dev' ? (
        <Button
          variant="ghost"
          size="sm"
          title="Sign out"
          onClick={handleSignOut}
        >
          <LogOut className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
