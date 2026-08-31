import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, XCircle } from 'lucide-react'

import { DataTable } from '@/components/data-table'
import { ApiErrorState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'
import type { RegistryCluster } from '@/lib/api'

const columns: ColumnDef<RegistryCluster>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id}</span>
    ),
  },
  { accessorKey: 'hostname', header: 'Hostname' },
  {
    accessorKey: 'api_base_url',
    header: 'API base URL',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.api_base_url}</span>
    ),
  },
  {
    id: 'token',
    header: 'Token',
    // Secrets are write-only (spec §1.4.3): the API reports only whether a
    // token is set, never its value — and there is no reveal button.
    cell: ({ row }) =>
      row.original.token_set ? (
        <Badge variant="secondary">token set</Badge>
      ) : (
        <Badge variant="outline">not set</Badge>
      ),
  },
  {
    id: 'validation',
    header: 'Validation',
    cell: ({ row }) => {
      const validation = row.original.validation
      if (!validation) return <Badge variant="muted">unknown</Badge>
      return validation.ok ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" aria-hidden /> ok
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
          title={validation.message}
        >
          <XCircle className="size-3.5" aria-hidden /> failed
        </span>
      )
    },
  },
]

/**
 * Registry admin (spec §5.6). Read-only until Phase 3 (D5) — edits stay in
 * clusters.toml + restart because the write API waits on the southbound
 * SSRF hardening. The endpoint itself is greenfield, so until
 * GET /api/v1/registry/clusters exists this page shows the
 * not-implemented empty state.
 */
export function RegistryPage() {
  const query = useQuery({
    queryKey: ['registry', 'clusters'],
    queryFn: api.registryClusters,
    retry: false,
    refetchInterval: 30_000,
  })

  return (
    <>
      <PageHeader
        title="Registry"
        description="Registered Ray cluster endpoints — hostnames, API base URLs, and credential status. (Admin)"
      />

      <Card className="mb-4">
        <CardContent className="py-3 text-sm text-muted-foreground">
          The registry is <span className="text-foreground">read-only</span>{' '}
          until Phase 3 (decision D5). To change it, edit{' '}
          <code className="text-foreground">clusters.toml</code> and restart{' '}
          <code className="text-foreground">mobula serve</code>.
        </CardContent>
      </Card>

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <DataTable columns={columns} data={query.data} />
      )}
    </>
  )
}
