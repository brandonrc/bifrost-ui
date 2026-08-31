import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useCanManageServices } from '@/auth/permissions'
import { ClusterStateBadge } from '@/components/cluster-state-badge'
import { ApiErrorState, EmptyState } from '@/components/empty-state'
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
import { api, MobulaApiError } from '@/lib/api'
import { serviceViewState } from '@/lib/services'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}

/**
 * Service detail, backed by the implemented `GET /api/v1/services/{name}`.
 * `ServiceView` is name/state/url only (no spec echo — the spec lives on the
 * RayService resource), so this page stays lean: status, endpoint, and the
 * one lifecycle action (delete, Developer/Admin, confirm dialog). There are
 * no logs/metrics tabs — no backend for them.
 */
export function ServiceDetailPage() {
  const { name = '' } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canManage = useCanManageServices()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['services', name],
    queryFn: () => api.service(name),
    retry: false,
    refetchInterval: 15_000,
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteService(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      navigate('/services')
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : String(err))
    },
  })

  if (query.isError) {
    // A 404 here means either the service doesn't exist or the whole
    // services API is unmounted (no provisioner configured) — the router
    // fallback returns the same bare 404 for both.
    const unavailable =
      query.error instanceof MobulaApiError && query.error.isNotImplemented
    return (
      <>
        <PageHeader title={`Service ${name}`} />
        {unavailable ? (
          <EmptyState
            title="Service not found"
            description={`No service named "${name}" — or the services API is not available on this deployment (no service provisioner configured).`}
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/services">Back to services</Link>
              </Button>
            }
          />
        ) : (
          <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
        )}
      </>
    )
  }

  const service = query.data

  return (
    <>
      <PageHeader
        title={service ? `Service ${service.name}` : `Service ${name}`}
        description={
          service ? (
            <span className="flex flex-wrap items-center gap-2">
              <ClusterStateBadge state={serviceViewState(service)} />
              {service.url ? (
                <Badge variant="outline" className="font-mono text-xs">
                  {service.url}
                </Badge>
              ) : null}
            </span>
          ) : undefined
        }
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/services">All services</Link>
            </Button>
            {canManage ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setDeleteError(null)
                  setConfirmDelete(true)
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : service ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Observed state"
                value={<ClusterStateBadge state={serviceViewState(service)} />}
              />
              <Field
                label="Serve endpoint"
                value={
                  service.url ? (
                    <a
                      href={service.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs hover:underline"
                    >
                      {service.url}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      not ready yet
                    </span>
                  )
                }
              />
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground lg:col-span-2">
            KubeRay's RayService controller owns convergence and upgrades —
            there is no Bifrost reconcile loop for services. Redeploy the same
            name from Deploy service to update the spec.
          </p>
        </div>
      ) : null}

      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete service {name}?</DialogTitle>
            <DialogDescription>
              The RayService is torn down and its Serve applications stop
              (DELETE returns 202). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
