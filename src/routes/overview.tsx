import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { ClusterStateBadge } from '@/components/cluster-state-badge'
import { EngineBadge } from '@/components/engine-badge'
import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, clusterViewState } from '@/lib/api'
import {
  countActiveJobs,
  countFailedJobsSince,
  recentJobs,
} from '@/lib/jobs'
import { sumResourceHours, usageWindow } from '@/lib/usage'

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  )
}

/**
 * Fleet overview (spec §5.1). The aggregating `GET /api/v1/overview`
 * endpoint is greenfield; until it lands this page degrades to the cluster
 * list plus placeholders.
 */
export function OverviewPage() {
  const clustersQuery = useQuery({
    queryKey: ['clusters'],
    queryFn: api.clusters,
    retry: false,
    refetchInterval: 30_000,
  })
  const clusters = clustersQuery.data
  const running = clusters?.filter(
    (c) => clusterViewState(c) === 'running',
  ).length

  // Resource totals until GET /api/v1/overview lands: metered resource-hours
  // over the last 24h from GET /api/v1/usage (api-v1.md §5.13). Failure or
  // an empty report degrades back to the placeholder.
  const usageQuery = useQuery({
    queryKey: ['usage', 86_400],
    queryFn: () => {
      const { from, to } = usageWindow(86_400)
      return api.usage(from, to)
    },
    retry: false,
    refetchInterval: 60_000,
  })
  const gpuHours = usageQuery.data
    ? sumResourceHours(usageQuery.data, 'nvidia.com/gpu')
    : undefined
  const cpuHours = usageQuery.data
    ? sumResourceHours(usageQuery.data, 'cpu')
    : undefined
  const resourceHoursValue =
    gpuHours === undefined && cpuHours === undefined
      ? '—'
      : `${(gpuHours ?? 0).toFixed(1)} GPU-h · ${(cpuHours ?? 0).toFixed(1)} CPU-h`

  // Job stat tiles + recent activity from GET /api/v1/jobs (spec §5.5).
  // Empty until gateway-submitted jobs are attributed backend-side (#89);
  // the tiles degrade to "—" and the feed to its empty state until then.
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: api.jobs,
    retry: false,
    refetchInterval: 30_000,
  })
  const jobs = jobsQuery.data
  const activeJobs = jobs ? countActiveJobs(jobs) : undefined
  const failedJobs24h = jobs
    ? countFailedJobsSince(jobs, usageWindow(86_400).from)
    : undefined
  const recent = jobs ? recentJobs(jobs, 6) : []

  return (
    <>
      <PageHeader
        title="Overview"
        description="Your Ray fleet at a glance — the screen the OSS Ray dashboard doesn't have."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Clusters running"
          value={clusters ? `${running ?? 0} / ${clusters.length}` : '—'}
        />
        <StatCard title="Resource-hours (24h)" value={resourceHoursValue} />
        <StatCard
          title="Active jobs"
          value={activeJobs === undefined ? '—' : String(activeJobs)}
        />
        <StatCard
          title="Failed jobs (24h)"
          value={failedJobs24h === undefined ? '—' : String(failedJobs24h)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Clusters</CardTitle>
          </CardHeader>
          <CardContent>
            {clustersQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : clustersQuery.isError ? (
              <ApiErrorState
                error={clustersQuery.error}
                onRetry={() => clustersQuery.refetch()}
              />
            ) : clusters && clusters.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Engine</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clusters.map((cluster) => (
                    <TableRow key={cluster.id}>
                      <TableCell>
                        <Link
                          to={`/clusters/${cluster.id}`}
                          className="font-medium hover:underline"
                        >
                          {cluster.id}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {cluster.project}
                      </TableCell>
                      <TableCell>
                        <EngineBadge engine={cluster.engine} />
                      </TableCell>
                      <TableCell>
                        <ClusterStateBadge state={clusterViewState(cluster)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No clusters yet"
                description="Register an existing Ray cluster or create a new one to see it here."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/clusters">Go to clusters</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {jobsQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : jobsQuery.isError ? (
              <ApiErrorState
                error={jobsQuery.error}
                onRetry={() => jobsQuery.refetch()}
              />
            ) : recent.length > 0 ? (
              <ul className="divide-y text-sm">
                {recent.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/jobs"
                        className="font-mono text-xs hover:underline"
                      >
                        {job.id}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.submitter} · {job.cluster}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {job.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No activity yet"
                description="Jobs submitted through Bifrost's gateway appear here — and stay here after their cluster is gone, because history lives in Bifrost, not on the head node."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
