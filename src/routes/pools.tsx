import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useCanWritePools } from '@/auth/permissions'
import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatResourceMap } from '@/lib/pools'

/**
 * Capacity pool list (api-v1.md §5.12). Pools are platform configuration:
 * reads are Viewer+, mutations Admin-only — the New-pool button and per-row
 * delete are gated on the caller holding the admin role.
 */
export function PoolsPage() {
  const canWrite = useCanWritePools()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['pools'],
    queryFn: api.pools,
    retry: false,
    refetchInterval: 30_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deletePool(name),
    onSuccess: () => {
      setConfirmDelete(null)
      setDeleteError(null)
      queryClient.invalidateQueries({ queryKey: ['pools'] })
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : String(err))
    },
  })

  return (
    <>
      <PageHeader
        title="Pools"
        description="Shared capacity pools — flavors, cohorts, and per-project allocations backed by Kueue (ADR-0010). Pools are engine-neutral: any project's clusters draw from them. Admission gang-suspends Ray workloads today; Dask enforcement is project-quota only."
        actions={
          canWrite ? (
            <Button asChild size="sm">
              <Link to="/pools/new">New pool</Link>
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
          title="No pools yet"
          description="Pools define shared capacity that projects borrow from. An admin can create the first one."
          action={
            canWrite ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/pools/new">New pool</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Cohort</TableHead>
              <TableHead>Elastic</TableHead>
              <TableHead>Fair-sharing weight</TableHead>
              <TableHead>Total nominal</TableHead>
              <TableHead>Generation</TableHead>
              {canWrite ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.map((pool) => (
              <TableRow key={pool.name}>
                <TableCell>
                  <Link
                    to={`/pools/${pool.name}`}
                    className="font-medium hover:underline"
                  >
                    {pool.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {pool.cohort}
                </TableCell>
                <TableCell>
                  {pool.elastic ? (
                    <Badge variant="secondary">elastic</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{pool.fairSharingWeight}</TableCell>
                <TableCell className="font-mono text-xs">
                  {formatResourceMap(pool.totalNominal)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {pool.generation}
                </TableCell>
                {canWrite ? (
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDeleteError(null)
                        setConfirmDelete(pool.name)
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete pool {confirmDelete}?</DialogTitle>
            <DialogDescription>
              Deleting a pool removes it and all of its project allocations
              from the control plane. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirmDelete) deleteMutation.mutate(confirmDelete)
              }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete pool'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
