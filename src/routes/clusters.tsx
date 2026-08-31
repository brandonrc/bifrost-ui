import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useCanManageClusters } from '@/auth/permissions'
import { ClusterStateBadge } from '@/components/cluster-state-badge'
import { EngineBadge } from '@/components/engine-badge'
import { DataTable } from '@/components/data-table'
import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { api, clusterViewState } from '@/lib/api'
import type { ClusterView } from '@/lib/api'
import {
  conditionPresentation,
  formatHourlyCost,
  partitionTerminated,
} from '@/lib/clusters'

const columns: ColumnDef<ClusterView>[] = [
  {
    accessorKey: 'id',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        to={`/clusters/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.id}
      </Link>
    ),
  },
  {
    accessorKey: 'project',
    header: 'Project',
    cell: ({ row }) => row.original.project,
  },
  {
    accessorKey: 'engine',
    header: 'Engine',
    cell: ({ row }) => <EngineBadge engine={row.original.engine} />,
  },
  {
    accessorKey: 'observedState',
    header: 'State',
    cell: ({ row }) => {
      const condition = conditionPresentation(row.original.condition)
      return (
        <span className="flex items-center gap-1.5">
          <ClusterStateBadge state={clusterViewState(row.original)} />
          {condition ? (
            // The reconcile engine's drift/health alarm (ADR-0004) —
            // distinct from the lifecycle state badge beside it.
            <span title={condition.tooltip}>
              <TriangleAlert
                className="size-3.5 text-amber-500"
                aria-label={condition.label}
              />
            </span>
          ) : null}
        </span>
      )
    },
  },
  {
    accessorKey: 'rayVersion',
    header: 'Ray version',
    cell: ({ row }) =>
      row.original.engine === 'ray' ? (
        row.original.rayVersion
      ) : (
        <span className="text-muted-foreground" title="Ray version applies to Ray clusters only">
          —
        </span>
      ),
  },
  {
    accessorKey: 'generation',
    header: 'Gen',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.generation}</span>
    ),
  },
  {
    accessorKey: 'estMaxHourly',
    header: 'Est. max $/hr',
    cell: ({ row }) => (
      <span
        className="font-mono text-xs"
        title={
          row.original.estMaxHourly == null
            ? 'No price sheet configured on the control plane'
            : undefined
        }
      >
        {formatHourlyCost(row.original.estMaxHourly)}
      </span>
    ),
  },
]

/**
 * Cluster list (spec §5.2), backed by the implemented
 * `GET /api/v1/clusters`. The create affordance is gated on Operator/Admin
 * (Write on Target::Cluster, api-v1.md §2.2); reads stay open to Viewer+.
 */
export function ClustersPage() {
  const canManage = useCanManageClusters()
  const [showTerminated, setShowTerminated] = useState(false)
  const query = useQuery({
    queryKey: ['clusters'],
    queryFn: api.clusters,
    retry: false,
    refetchInterval: 30_000,
  })

  // Terminated clusters are tombstones (terminal, no longer exist) and
  // clutter the list, so hide them by default behind a toggle. They stay
  // openable — the detail route renders Terminated + the empty tabs.
  const { active, terminated } = partitionTerminated(query.data ?? [])
  const rows = showTerminated ? [...active, ...terminated] : active

  return (
    <>
      <PageHeader
        title="Clusters"
        description="Every Ray cluster Bifrost manages, across all projects you can see."
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link to="/clusters/new">New cluster</Link>
            </Button>
          ) : undefined
        }
      />

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          title="No clusters yet"
          description="Bifrost can adopt Ray clusters you already run, or create new ones from a declarative spec (Operator/Admin)."
          action={
            <>
              <Button asChild size="sm" variant="outline">
                <Link to="/registry">Register an existing cluster</Link>
              </Button>
              {canManage ? (
                <Button asChild size="sm">
                  <Link to="/clusters/new">Create a new cluster</Link>
                </Button>
              ) : null}
            </>
          }
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? 'cluster' : 'clusters'}
              {!showTerminated && terminated.length > 0
                ? ` · ${terminated.length} terminated hidden`
                : null}
            </p>
            {terminated.length > 0 ? (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showTerminated}
                  onChange={(e) => setShowTerminated(e.target.checked)}
                />
                Show terminated
              </label>
            ) : null}
          </div>
          <DataTable columns={columns} data={rows} />
        </div>
      )}
    </>
  )
}
