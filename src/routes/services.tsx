import { useQuery } from '@tanstack/react-query'
import { CloudOff } from 'lucide-react'
import { Link } from 'react-router'

import { useCanManageServices } from '@/auth/permissions'
import { ClusterStateBadge } from '@/components/cluster-state-badge'
import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, BifrostApiError } from '@/lib/api'
import type { ServiceView } from '@/lib/api'
import { serviceViewState } from '@/lib/services'

/**
 * The `/api/v1/services` routes are only mounted when the control plane runs
 * with a service provisioner — otherwise every services call 404s ("not
 * found" from the router fallback). Render that as a clean capability gap,
 * not a crash.
 */
export function ServicesUnavailableState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon={CloudOff}
      title="Services API not available on this deployment"
      description="The running control plane has no service provisioner configured, so it does not serve /api/v1/services. Services appear here when Bifrost runs against KubeRay with the RayService controller enabled."
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    />
  )
}

/**
 * Ray Serve service list, backed by the implemented `GET /api/v1/services`
 * (a thin proxy over KubeRay RayService — there is no Bifrost store here).
 * `ServiceView` is name/state/url only: project, ray_version, and the
 * upgrade strategy are spec fields the view does not echo, so the table
 * shows what the wire actually carries. The deploy affordance is gated on
 * Developer/Admin (Write on Target::Service); reads stay open to Viewer+.
 */
export function ServicesPage() {
  const canManage = useCanManageServices()
  const query = useQuery({
    queryKey: ['services'],
    queryFn: api.services,
    retry: false,
    refetchInterval: 30_000,
  })

  return (
    <>
      <PageHeader
        title="Services"
        description="Ray Serve applications Bifrost deploys as KubeRay RayServices. Serve is Ray-only — Dask clusters have no services and never appear here."
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link to="/services/new">Deploy service</Link>
            </Button>
          ) : undefined
        }
      />

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        query.error instanceof BifrostApiError &&
        query.error.isNotImplemented ? (
          <ServicesUnavailableState onRetry={() => query.refetch()} />
        ) : (
          <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
        )
      ) : query.data.length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Deploy a Serve application from a declarative spec — Bifrost hands it to KubeRay, which owns rollout and zero-downtime upgrades (Developer/Admin)."
          action={
            canManage ? (
              <Button asChild size="sm">
                <Link to="/services/new">Deploy a service</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Endpoint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.map((service: ServiceView) => (
              <TableRow key={service.name}>
                <TableCell>
                  <Link
                    to={`/services/${service.name}`}
                    className="font-medium hover:underline"
                  >
                    {service.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <ClusterStateBadge state={serviceViewState(service)} />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {service.url ? (
                    <a
                      href={service.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {service.url}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      not ready yet
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
