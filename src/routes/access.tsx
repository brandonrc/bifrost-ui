import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useAuth } from '@/auth/auth-context'
import { ApiErrorState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ACCESS_ROLES,
  accessSections,
  emptyUserForm,
  formatCreatedAt,
  mappingsNote,
  roleMappingRows,
  validateUserForm,
  type UserFormState,
} from '@/lib/access'
import { api } from '@/lib/api'
import type { Identity, LocalUserView, Role, UpdateLocalUser } from '@/lib/api'
import { getSessionMeta } from '@/lib/auth-token'
import { parseProviders } from '@/lib/providers'

const ROLE_VARIANT: Record<Role, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  operator: 'secondary',
  developer: 'secondary',
  viewer: 'outline',
} as const

function IdentityCard({ identity, source }: { identity: Identity; source: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who am I</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Subject</span>
          <span className="font-mono text-xs">{identity.subject}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Email</span>
          <span className="font-mono text-xs">{identity.email ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Groups</span>
          <span className="flex flex-wrap justify-end gap-1">
            {identity.groups.length > 0
              ? identity.groups.map((g) => (
                  <Badge key={g} variant="secondary">
                    {g}
                  </Badge>
                ))
              : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Roles</span>
          <span className="flex gap-1">
            {identity.roles.length
              ? identity.roles.map((r) => (
                  <Badge key={r} variant={ROLE_VARIANT[r] ?? 'outline'}>
                    {r}
                  </Badge>
                ))
              : '—'}
          </span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">{source}</p>
      </CardContent>
    </Card>
  )
}

/** Admin-only card; the parent never mounts it for non-admins. */
function RoleMappingsCard() {
  const query = useQuery({
    queryKey: ['access-roles'],
    queryFn: api.accessRoles,
    retry: false,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role mappings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {query.isPending ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : query.isError ? (
          <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.mappings == null ? (
          <p className="text-muted-foreground">{mappingsNote(query.data.source)}</p>
        ) : (
          <>
            {roleMappingRows(query.data.mappings).map((row) => (
              <div key={row.role} className="flex justify-between gap-4">
                <Badge variant={ROLE_VARIANT[row.role]}>{row.role}</Badge>
                <span className="flex flex-wrap justify-end gap-1">
                  {row.groups.length > 0
                    ? row.groups.map((g) => (
                        <Badge key={g} variant="secondary">
                          {g}
                        </Badge>
                      ))
                    : '—'}
                </span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Read-only — editing stays in the auth config file + restart
              (source: {query.data.source}).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function NewUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<UserFormState>(emptyUserForm())
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () =>
      api.createLocalUser({
        username: form.username,
        email: form.email.trim() === '' ? undefined : form.email.trim(),
        password: form.password,
        role: form.role,
      }),
    onSuccess: () => {
      onOpenChange(false)
      setForm(emptyUserForm())
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['local-users'] })
    },
    onError: (err) => {
      // 400/409 messages surface verbatim (e.g. "username already taken").
      setError(err instanceof Error ? err.message : String(err))
    },
  })

  const submit = () => {
    const invalid = validateUserForm(form)
    if (invalid != null) {
      setError(invalid)
      return
    }
    setError(null)
    createMutation.mutate()
  }

  const set = (patch: Partial<UserFormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New local user</DialogTitle>
          <DialogDescription>
            Creates a local-auth account (ADR-0011). The password is
            bcrypt-hashed at rest and never shown again.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Input
            value={form.username}
            onChange={(e) => set({ username: e.target.value })}
            placeholder="Username (RFC 1123, e.g. ml-eng.jane)"
            autoComplete="off"
            aria-label="Username"
          />
          <Input
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="Email (optional)"
            autoComplete="off"
            aria-label="Email"
          />
          <Input
            type="password"
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder="Password (min 8 characters)"
            autoComplete="new-password"
            aria-label="Password"
          />
          <select
            value={form.role}
            onChange={(e) => set({ role: e.target.value as Role })}
            aria-label="Role"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {ACCESS_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Users table + mutations; mounted only for admins on local-auth deployments. */
function UsersSection() {
  const queryClient = useQueryClient()
  const [newUserOpen, setNewUserOpen] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['local-users'],
    queryFn: api.localUsers,
    retry: false,
  })

  const updateMutation = useMutation({
    mutationFn: ({ username, body }: { username: string; body: UpdateLocalUser }) =>
      api.updateLocalUser(username, body),
    onSuccess: () => {
      setMutationError(null)
      queryClient.invalidateQueries({ queryKey: ['local-users'] })
    },
    onError: (err) => {
      setMutationError(err instanceof Error ? err.message : String(err))
    },
  })

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <Button size="sm" onClick={() => setNewUserOpen(true)}>
          New user
        </Button>
      </div>

      {mutationError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{mutationError}</p>
      ) : null}

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.map((user: LocalUserView) => (
              <TableRow key={user.username}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell className="text-muted-foreground">
                  {user.email ?? '—'}
                </TableCell>
                <TableCell>
                  <select
                    value={user.role}
                    disabled={updateMutation.isPending}
                    onChange={(e) =>
                      updateMutation.mutate({
                        username: user.username,
                        body: { role: e.target.value as Role },
                      })
                    }
                    aria-label={`Role for ${user.username}`}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {ACCESS_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  {user.disabled ? (
                    <Badge variant="destructive">disabled</Badge>
                  ) : (
                    <Badge variant="outline">active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCreatedAt(user.created_at)}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        username: user.username,
                        body: { disabled: !user.disabled },
                      })
                    }
                  >
                    {user.disabled ? 'Enable' : 'Disable'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NewUserDialog open={newUserOpen} onOpenChange={setNewUserOpen} />
    </section>
  )
}

/**
 * Access control (api-v1.md §5.8 — implemented). Three cards: "Who am I"
 * (GET /api/v1/identity, with the session fallback on older backends),
 * role mappings (Admin-only; group→role from the auth config, or the
 * local-mode note), and — Admin + `--local-auth` deployments only — local
 * user management. Plus a static service-accounts note.
 */
export function AccessPage() {
  const { identity: sessionIdentity, sessionSource } = useAuth()

  const identityQuery = useQuery({
    queryKey: ['identity'],
    queryFn: api.identity,
    retry: false,
  })

  const providersQuery = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.authProviders,
    retry: false,
    staleTime: 60_000,
  })
  const providers = providersQuery.isSuccess
    ? parseProviders(providersQuery.data)
    : null

  // Gate on the server-reported identity when available (local-user roles
  // resolve per request — the stored session identity can be stale), else
  // the session identity.
  const reportedIdentity = identityQuery.isSuccess
    ? identityQuery.data
    : sessionIdentity
  const isAdmin = reportedIdentity?.roles.includes('admin') ?? false
  const sections = accessSections(isAdmin, providers)

  const sessionNote = (() => {
    switch (sessionSource) {
      case 'sso':
        return 'Decoded client-side from the SSO token (the backend validates the signature).'
      case 'local': {
        const expiresAt = getSessionMeta()?.expiresAt
        const expiry =
          expiresAt != null
            ? ` Token expires ${new Date(expiresAt * 1000).toLocaleString()}.`
            : ''
        return `Signed in via local auth (ADR-0011); identity reported by the login response.${expiry}`
      }
      case 'pat':
        return 'Decoded client-side from the pasted token (the backend validates the signature).'
      default:
        return 'Dev-mode stub identity (VITE_MOBULA_DEV_AUTH) — shown until /api/v1/identity and OIDC login exist.'
    }
  })()

  return (
    <>
      <PageHeader
        title="Access"
        description="Users, roles, role mappings, and service accounts. (Admin)"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {identityQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading identity…</p>
        ) : identityQuery.isSuccess ? (
          <IdentityCard
            identity={identityQuery.data}
            source="Reported by GET /api/v1/identity."
          />
        ) : (
          <div className="space-y-4">
            <ApiErrorState
              error={identityQuery.error}
              onRetry={() => identityQuery.refetch()}
            />
            {sessionIdentity ? (
              <IdentityCard identity={sessionIdentity} source={sessionNote} />
            ) : null}
          </div>
        )}

        {sections.roleMappings ? <RoleMappingsCard /> : null}
      </div>

      {sections.users === 'table' ? (
        <div className="mt-6">
          <UsersSection />
        </div>
      ) : sections.users === 'oidc-note' ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Users are managed by the OIDC provider — this deployment has no
          local accounts.
        </p>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Service accounts</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Non-human callers authenticate with OIDC client-credentials
            tokens (<code className="text-foreground">bifrost token …</code>)
            or per-user personal access tokens (
            <code className="text-foreground">bifrost login</code> /{' '}
            <code className="text-foreground">POST /api/v1/auth/tokens</code>
            ). PAT management stays in the CLI for v1 (api-v1.md §5.15).
          </p>
        </CardContent>
      </Card>
    </>
  )
}
