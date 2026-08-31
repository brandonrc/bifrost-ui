import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router'

import { useCanWritePools } from '@/auth/permissions'
import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { PairEditor } from '@/components/pair-editor'
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
import { api } from '@/lib/api'
import type { PairRow } from '@/lib/pools'
import { formatResourceAmount, formatResourceMap, pairsToMap } from '@/lib/pools'

interface AllocationFormState {
  project: string
  namespace: string
  nominal: PairRow[]
  borrowingLimit: PairRow[]
  lendingLimit: PairRow[]
}

const emptyAllocationForm: AllocationFormState = {
  project: '',
  namespace: '',
  nominal: [],
  borrowingLimit: [],
  lendingLimit: [],
}

function UtilizationBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
    </div>
  )
}

/**
 * Pool detail (api-v1.md §5.12): spec summary, per-project allocations, and
 * the live point-in-time usage view. Mutations (put/delete allocation) are
 * Admin-only; reads are Viewer+.
 */
export function PoolDetailPage() {
  const { name = '' } = useParams()
  const canWrite = useCanWritePools()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState<AllocationFormState>(emptyAllocationForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const poolQuery = useQuery({
    queryKey: ['pools', name],
    queryFn: () => api.pool(name),
    retry: false,
    refetchInterval: 30_000,
  })
  const allocationsQuery = useQuery({
    queryKey: ['pools', name, 'allocations'],
    queryFn: () => api.allocations(name),
    retry: false,
    refetchInterval: 30_000,
  })
  const usageQuery = useQuery({
    queryKey: ['pools', name, 'usage'],
    queryFn: () => api.poolUsage(name),
    retry: false,
    refetchInterval: 15_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pools'] })
  }

  const putMutation = useMutation({
    mutationFn: () =>
      api.putAllocation(name, form.project.trim(), {
        namespace: form.namespace.trim(),
        nominal: pairsToMap(form.nominal),
        borrowingLimit: pairsToMap(form.borrowingLimit),
        lendingLimit: pairsToMap(form.lendingLimit),
      }),
    onSuccess: () => {
      setAddOpen(false)
      setForm(emptyAllocationForm)
      setFormError(null)
      invalidate()
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : String(err))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (project: string) => api.deleteAllocation(name, project),
    onSuccess: () => {
      setConfirmDelete(null)
      setDeleteError(null)
      invalidate()
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : String(err))
    },
  })

  const onSubmitAllocation = (event: FormEvent) => {
    event.preventDefault()
    if (form.project.trim() === '') {
      setFormError('Project is required.')
      return
    }
    if (form.namespace.trim() === '') {
      setFormError('Namespace is required.')
      return
    }
    setFormError(null)
    putMutation.mutate()
  }

  if (poolQuery.isError) {
    return (
      <>
        <PageHeader title={`Pool ${name}`} />
        <ApiErrorState
          error={poolQuery.error}
          onRetry={() => poolQuery.refetch()}
        />
      </>
    )
  }

  const pool = poolQuery.data
  const usage = usageQuery.data

  return (
    <>
      <PageHeader
        title={pool ? `Pool ${pool.name}` : `Pool ${name}`}
        description={
          pool
            ? `Cohort ${pool.cohort} · fair-sharing weight ${pool.fairSharingWeight} · generation ${pool.generation}`
            : undefined
        }
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/pools">All pools</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spec</CardTitle>
          </CardHeader>
          <CardContent>
            {poolQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pool ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {pool.elastic ? (
                    <Badge variant="secondary">elastic</Badge>
                  ) : (
                    <Badge variant="outline">static</Badge>
                  )}
                  <Badge variant="outline">
                    created {new Date(pool.createdAt * 1000).toLocaleString()}
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flavor</TableHead>
                      <TableHead>Resources</TableHead>
                      <TableHead>Node labels</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pool.flavors.map((flavor) => (
                      <TableRow key={flavor.name}>
                        <TableCell className="font-medium">
                          {flavor.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatResourceMap(flavor.resources)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatResourceMap(flavor.nodeLabels)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-sm text-muted-foreground">
                  Total nominal:{' '}
                  <code className="text-xs text-foreground">
                    {formatResourceMap(pool.totalNominal)}
                  </code>
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live usage</CardTitle>
          </CardHeader>
          <CardContent>
            {usageQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : usageQuery.isError ? (
              <ApiErrorState
                error={usageQuery.error}
                onRetry={() => usageQuery.refetch()}
              />
            ) : usage ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {usage.sampledAt != null
                    ? `Sampled ${new Date(usage.sampledAt * 1000).toLocaleString()} — allocated is Kueue's reservation ledger, not measured consumption.`
                    : 'Not sampled yet — the pool reconcile loop has not observed this pool.'}
                </p>
                {Object.keys(usage.utilization).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No utilization data yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(usage.utilization).map(
                      ([resource, util]) => (
                        <div
                          key={resource}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="font-mono text-xs">{resource}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatResourceAmount(resource, util.allocated)} /
                            {formatResourceAmount(resource, util.nominal)} allocated
                          </span>
                          <UtilizationBar pct={util.pct} />
                        </div>
                      ),
                    )}
                  </div>
                )}
                {Object.keys(usage.projects).length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Allocated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(usage.projects).map(
                        ([project, resources]) => (
                          <TableRow key={project}>
                            <TableCell>{project}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {Object.entries(resources)
                                .map(([key, value]) => `${key}=${formatResourceAmount(key, value)}`)
                                .join(', ')}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Allocations</CardTitle>
          {canWrite ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm(emptyAllocationForm)
                setFormError(null)
                setAddOpen(true)
              }}
            >
              Add allocation
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {allocationsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : allocationsQuery.isError ? (
            <ApiErrorState
              error={allocationsQuery.error}
              onRetry={() => allocationsQuery.refetch()}
            />
          ) : allocationsQuery.data.length === 0 ? (
            <EmptyState
              title="No allocations"
              description="Projects get access to this pool through allocations (Kueue LocalQueues)."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Namespace</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead>Borrowing limit</TableHead>
                  <TableHead>Lending limit</TableHead>
                  {canWrite ? <TableHead className="w-0" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocationsQuery.data.map((allocation) => (
                  <TableRow key={allocation.project}>
                    <TableCell className="font-medium">
                      {allocation.project}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {allocation.namespace}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatResourceMap(allocation.nominal)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatResourceMap(allocation.borrowingLimit)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatResourceMap(allocation.lendingLimit)}
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDeleteError(null)
                            setConfirmDelete(allocation.project)
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
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add allocation to {name}</DialogTitle>
            <DialogDescription>
              Grants a project access to this pool. The resource maps are
              recorded as LocalQueue annotations in the v0 layout (ADR-0010).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitAllocation} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">Project</span>
                <Input
                  value={form.project}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, project: e.target.value }))
                  }
                  placeholder="proj-a"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted-foreground">Namespace</span>
                <Input
                  value={form.namespace}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, namespace: e.target.value }))
                  }
                  placeholder="proj-a"
                />
              </label>
            </div>
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">
                Nominal quota (optional)
              </span>
              <PairEditor
                rows={form.nominal}
                onChange={(nominal) => setForm((prev) => ({ ...prev, nominal }))}
                keyPlaceholder="cpu"
                valuePlaceholder="16"
                addLabel="Add resource"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">
                Borrowing limit (optional)
              </span>
              <PairEditor
                rows={form.borrowingLimit}
                onChange={(borrowingLimit) =>
                  setForm((prev) => ({ ...prev, borrowingLimit }))
                }
                keyPlaceholder="cpu"
                valuePlaceholder="32"
                addLabel="Add resource"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">
                Lending limit (optional)
              </span>
              <PairEditor
                rows={form.lendingLimit}
                onChange={(lendingLimit) =>
                  setForm((prev) => ({ ...prev, lendingLimit }))
                }
                keyPlaceholder="cpu"
                valuePlaceholder="8"
                addLabel="Add resource"
              />
            </div>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={putMutation.isPending}>
                {putMutation.isPending ? 'Saving…' : 'Save allocation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Remove allocation for {confirmDelete}?
            </DialogTitle>
            <DialogDescription>
              The project loses access to pool {name}. This cannot be undone.
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
              {deleteMutation.isPending ? 'Deleting…' : 'Delete allocation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
