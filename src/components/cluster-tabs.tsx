import { useQuery } from '@tanstack/react-query'
import { Ban, CloudOff, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
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
import { api, BifrostApiError } from '@/lib/api'
import type {
  ClusterEventsView,
  ClusterJobView,
  ClusterLogsView,
  ClusterMetricsView,
  ClusterNodesView,
  NodeView,
  ResourceStat,
} from '@/lib/api'
import { headRoleLabel, type Engine } from '@/lib/engine'
import { cn } from '@/lib/utils'

/** `memory_bytes` → GiB with one decimal; em dash when the field is absent. */
export function formatMemoryGiB(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
}

/** CPU cores; em dash when absent. Trims to at most two decimals. */
export function formatCpuCores(cpu: number | null | undefined): string {
  if (cpu == null) return '—'
  const cores = Math.round(cpu * 100) / 100
  return `${cores} ${cores === 1 ? 'core' : 'cores'}`
}

/** GPU count; em dash when absent. */
export function formatGpu(gpu: number | null | undefined): string {
  if (gpu == null) return '—'
  return String(gpu)
}

/** Epoch-ms start time → locale string; em dash when absent. */
export function formatJobStart(ms: number | null | undefined): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleString()
}

/**
 * Job wall-clock from epoch-ms bounds. Renders a dash while still running
 * (no `end_time`) or when either bound is missing.
 */
export function formatJobDuration(
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (start == null || end == null) return '—'
  const secs = Math.max(0, Math.round((end - start) / 1000))
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** Ray job status → badge classes (matches the global Jobs page). */
function jobStatusClasses(status: string): string {
  switch (status.toUpperCase()) {
    case 'SUCCEEDED':
      return 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    case 'RUNNING':
      return 'border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400'
    case 'FAILED':
      return 'border-transparent bg-red-500/15 text-red-600 dark:text-red-400'
    case 'PENDING':
      return 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400'
    default: // STOPPED and anything else
      return 'border-transparent bg-muted text-muted-foreground'
  }
}

function NodeStatusBadge({ phase, ready }: { phase: string; ready: boolean }) {
  return (
    <Badge
      variant={ready ? 'success' : 'warning'}
      className="font-medium"
      title={ready ? 'Pod is ready' : 'Pod is not ready'}
    >
      {phase}
      {ready ? '' : ' · not ready'}
    </Badge>
  )
}

function NodesTable({ nodes }: { nodes: NodeView[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pod</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">CPU</TableHead>
          <TableHead className="text-right">Memory</TableHead>
          <TableHead className="text-right">GPU</TableHead>
          <TableHead>Node IP</TableHead>
          <TableHead>Host</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nodes.map((node) => (
          <TableRow key={node.pod_name}>
            <TableCell className="font-mono text-xs">{node.pod_name}</TableCell>
            <TableCell>
              <NodeStatusBadge phase={node.phase} ready={node.ready} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCpuCores(node.cpu)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMemoryGiB(node.memory_bytes)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatGpu(node.gpu)}
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {node.node_ip ?? '—'}
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {node.host ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Presentational Nodes view: the head node then each worker group (with its
 * ready/desired count) and the pods in it. Backed by
 * `GET /api/v1/clusters/{id}/nodes` — observability only (D2: scale is
 * group-level, there is no "add node" button).
 */
export function NodesSection({
  data,
  engine = 'ray',
}: {
  data: ClusterNodesView
  engine?: Engine
}) {
  const headLabel = headRoleLabel(engine)
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{headLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.head ? (
            <NodesTable nodes={[data.head]} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No {headLabel.toLowerCase()} is currently reported for this
              cluster.
            </p>
          )}
        </CardContent>
      </Card>

      {data.worker_groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Worker groups</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This cluster has no worker groups.
            </p>
          </CardContent>
        </Card>
      ) : (
        data.worker_groups.map((group) => (
          <Card key={group.name}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>{group.name}</CardTitle>
              <Badge
                variant={group.ready >= group.desired ? 'success' : 'warning'}
                className="font-medium tabular-nums"
                title="ready / desired replicas"
              >
                {group.ready}/{group.desired} ready
              </Badge>
            </CardHeader>
            <CardContent>
              {group.nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No pods are currently scheduled for this group.
                </p>
              ) : (
                <NodesTable nodes={group.nodes} />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

/**
 * Presentational Jobs view: live jobs for one cluster, or the first-run
 * empty state. Backed by `GET /api/v1/clusters/{id}/jobs`.
 */
export function JobsSection({ jobs }: { jobs: ClusterJobView[] }) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No jobs on this cluster yet."
        description="Submit a job to this cluster through Bifrost's gateway and it will appear here while it runs."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jobs</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entrypoint</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job, index) => {
              const id = job.job_id ?? job.submission_id ?? '—'
              const status = job.status ?? 'UNKNOWN'
              return (
                <TableRow key={job.job_id ?? job.submission_id ?? index}>
                  <TableCell className="font-mono text-xs">{id}</TableCell>
                  <TableCell>
                    <Badge className={cn('font-medium', jobStatusClasses(status))}>
                      {status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {job.entrypoint ? (
                      <span
                        className="block truncate font-mono text-xs"
                        title={job.entrypoint}
                      >
                        {job.entrypoint}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatJobStart(job.start_time)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatJobDuration(job.start_time, job.end_time)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/**
 * Error rendering shared by the Nodes and Jobs tabs. A per-cluster 503 means
 * the control plane is up but the cluster's Ray dashboard is unreachable —
 * render that as a clean inline message rather than the generic
 * control-plane-unreachable state. Everything else (401/403/404/network)
 * routes through the shared `ApiErrorState`.
 */
export function ClusterTabError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  if (error instanceof BifrostApiError && error.status === 503) {
    return (
      <EmptyState
        icon={CloudOff}
        title="Cluster unreachable"
        description="The control plane could not reach this cluster's Ray dashboard (503). It may be starting up, suspended, or temporarily unavailable — try again shortly."
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
  return <ApiErrorState error={error} onRetry={onRetry} />
}

/** Container: fetches the cluster's nodes and renders the Nodes tab body. */
export function ClusterNodesTab({
  clusterId,
  engine = 'ray',
}: {
  clusterId: string
  engine?: Engine
}) {
  const query = useQuery({
    queryKey: ['clusters', clusterId, 'nodes'],
    queryFn: () => api.clusterNodes(clusterId),
    retry: false,
    refetchInterval: 15_000,
  })

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (query.isError) {
    return <ClusterTabError error={query.error} onRetry={() => query.refetch()} />
  }
  return <NodesSection data={query.data} engine={engine} />
}

/**
 * Jobs are a Ray-only surface: Ray proxies its own /api/jobs/ per cluster,
 * Dask has no job-submission API. On a Dask cluster this renders a clean
 * not-applicable state (not "pending backend", not an error).
 */
export function DaskJobsNotApplicable() {
  return (
    <EmptyState
      icon={Ban}
      title="Not applicable — Dask has no job-submission API"
      description="Dask clusters expose a scheduler and workers but no Ray-Jobs-equivalent submission API, so there are no per-cluster jobs to list here. Drive work through the Dask scheduler directly (e.g. client.submit / dask.compute)."
    />
  )
}

/** Container: fetches the cluster's live jobs and renders the Jobs tab body. */
export function ClusterJobsTab({
  clusterId,
  engine = 'ray',
}: {
  clusterId: string
  engine?: Engine
}) {
  const query = useQuery({
    queryKey: ['clusters', clusterId, 'jobs'],
    queryFn: () => api.clusterJobs(clusterId),
    retry: false,
    refetchInterval: 15_000,
    // Dask has no jobs API — never hit the endpoint for a Dask cluster.
    enabled: engine === 'ray',
  })

  if (engine === 'dask') return <DaskJobsNotApplicable />
  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (query.isError) {
    return <ClusterTabError error={query.error} onRetry={() => query.refetch()} />
  }
  return <JobsSection jobs={query.data} />
}

// ---------------------------------------------------------------------------
// Events (api-v1.md §5.6a)
// ---------------------------------------------------------------------------

/** RFC3339 timestamp → compact relative age ("5m", "3h", "2d"); dash when absent. */
export function formatRelativeAge(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return '—'
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/**
 * Presentational Events view: a table of the cluster's Kubernetes events
 * (type badge, reason, message, count, age). Backed by
 * `GET /api/v1/clusters/{id}/events` — K8s-sourced, so it answers even when
 * the Ray dashboard is down.
 */
export function EventsSection({ data }: { data: ClusterEventsView }) {
  if (data.events.length === 0) {
    return (
      <EmptyState
        title="No events for this cluster."
        description="Kubernetes has recorded no recent events for this cluster's objects. Scheduling, image-pull, and probe events appear here as they happen."
      />
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Events</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.events.map((ev, index) => (
              <TableRow key={`${ev.object ?? ''}-${ev.reason ?? ''}-${index}`}>
                <TableCell>
                  <Badge
                    variant={ev.type === 'Warning' ? 'warning' : 'muted'}
                    className="font-medium"
                  >
                    {ev.type}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {ev.reason ?? '—'}
                </TableCell>
                <TableCell className="max-w-md">
                  <span className="block text-sm" title={ev.object ?? undefined}>
                    {ev.message ?? '—'}
                  </span>
                  {ev.object ? (
                    <span className="text-xs text-muted-foreground">
                      {ev.object}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ev.count}
                </TableCell>
                <TableCell
                  className="text-right tabular-nums text-muted-foreground"
                  title={ev.last_seen ?? undefined}
                >
                  {formatRelativeAge(ev.last_seen)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/** Container: fetches the cluster's events and renders the Events tab body. */
export function ClusterEventsTab({ clusterId }: { clusterId: string }) {
  const query = useQuery({
    queryKey: ['clusters', clusterId, 'events'],
    queryFn: () => api.clusterEvents(clusterId),
    retry: false,
    refetchInterval: 15_000,
  })

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (query.isError) {
    return <ClusterTabError error={query.error} onRetry={() => query.refetch()} />
  }
  return <EventsSection data={query.data} />
}

// ---------------------------------------------------------------------------
// Metrics (api-v1.md §5.x resource summary)
// ---------------------------------------------------------------------------

/** GiB with one decimal (metrics memory is in bytes). */
function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}`
}

/**
 * A resource stat tile. When live utilization is known (`stat.used != null`)
 * it shows used/total with a meter; otherwise it shows the capacity only (a
 * non-autoscaling cluster reports no live `used`). `render` formats each
 * number.
 */
function StatTile({
  label,
  stat,
  unit,
  render,
}: {
  label: string
  stat: ResourceStat
  unit: string
  render: (n: number) => string
}) {
  const hasUsed = stat.used != null
  const pct =
    hasUsed && stat.total > 0
      ? Math.min(100, Math.max(0, ((stat.used as number) / stat.total) * 100))
      : 0
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {hasUsed ? (
          <>
            <div className="text-2xl font-semibold tabular-nums">
              {render(stat.used as number)}
              <span className="text-base font-normal text-muted-foreground">
                {' / '}
                {render(stat.total)} {unit}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${label} utilization`}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {Math.round(pct)}% used
            </div>
          </>
        ) : (
          <>
            <div className="text-2xl font-semibold tabular-nums">
              {render(stat.total)}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                {unit}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">capacity</div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Presentational Metrics view: resource stat tiles (CPU/GPU/memory/object
 * store) plus autoscaler node counts. Backed by
 * `GET /api/v1/clusters/{id}/metrics` (distilled from the Ray dashboard's
 * autoscaler report). Renders only the tiles the cluster reports.
 */
export function MetricsSection({ data }: { data: ClusterMetricsView }) {
  const tiles: React.ReactNode[] = []
  if (data.cpu)
    tiles.push(
      <StatTile
        key="cpu"
        label="CPU"
        stat={data.cpu}
        unit="cores"
        render={(n) => String(Math.round(n * 100) / 100)}
      />,
    )
  if (data.gpu)
    tiles.push(
      <StatTile
        key="gpu"
        label="GPU"
        stat={data.gpu}
        unit=""
        render={(n) => String(Math.round(n * 100) / 100)}
      />,
    )
  if (data.memory)
    tiles.push(
      <StatTile
        key="memory"
        label="Memory"
        stat={data.memory}
        unit="GiB"
        render={gib}
      />,
    )
  if (data.object_store_memory)
    tiles.push(
      <StatTile
        key="oss"
        label="Object store"
        stat={data.object_store_memory}
        unit="GiB"
        render={gib}
      />,
    )

  const nodeCounts = [
    { label: 'Active nodes', value: data.active_nodes, variant: 'success' as const },
    { label: 'Pending', value: data.pending_nodes, variant: 'warning' as const },
    { label: 'Failed', value: data.failed_nodes, variant: 'destructive' as const },
  ].filter((c) => c.value != null)

  if (tiles.length === 0 && nodeCounts.length === 0) {
    return (
      <EmptyState
        title="No resource metrics reported."
        description="The cluster's Ray dashboard returned no resource-usage report. This can happen briefly while the head is starting; it will populate once the autoscaler reports."
      />
    )
  }

  return (
    <div className="space-y-4">
      {tiles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{tiles}</div>
      ) : null}
      {nodeCounts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nodes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {nodeCounts.map((c) => (
              <Badge key={c.label} variant={c.variant} className="font-medium tabular-nums">
                {c.label}: {c.value}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

/** Container: fetches the cluster's metrics summary and renders the tab body. */
export function ClusterMetricsTab({ clusterId }: { clusterId: string }) {
  const query = useQuery({
    queryKey: ['clusters', clusterId, 'metrics'],
    queryFn: () => api.clusterMetrics(clusterId),
    retry: false,
    refetchInterval: 15_000,
  })

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (query.isError) {
    return <ClusterTabError error={query.error} onRetry={() => query.refetch()} />
  }
  return <MetricsSection data={query.data} />
}

// ---------------------------------------------------------------------------
// Logs (api-v1.md §5.6b, non-streaming first cut)
// ---------------------------------------------------------------------------

/**
 * Presentational Logs view: a pod selector (when the cluster has more than
 * one pod), a refresh button, and a monospace tail. Backed by the
 * non-streaming `GET /api/v1/clusters/{id}/logs` — WS streaming is a
 * documented follow-up, surfaced here as a "streaming coming soon" note.
 */
export function LogsSection({
  data,
  selectedPod,
  onSelectPod,
  onRefresh,
  refreshing,
}: {
  data: ClusterLogsView
  selectedPod: string
  onSelectPod: (pod: string) => void
  onRefresh: () => void
  refreshing?: boolean
}) {
  const activePod = selectedPod || data.pod
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {data.pods.length > 0 ? (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Pod</span>
              <select
                className="rounded-md border bg-background px-2 py-1 font-mono text-xs"
                value={activePod}
                onChange={(e) => onSelectPod(e.target.value)}
              >
                {data.pods.map((pod) => (
                  <option key={pod} value={pod}>
                    {pod}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Badge variant="muted" className="font-normal">
            streaming coming soon
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={cn('size-3.5', refreshing && 'animate-spin')}
            aria-hidden
          />
          Refresh
        </Button>
      </div>

      {data.pods.length === 0 ? (
        <EmptyState
          title="No pods to tail yet."
          description="This cluster has no pods scheduled. Logs will appear once the head and worker pods start."
        />
      ) : data.lines.length === 0 ? (
        <EmptyState
          title="No log lines."
          description={`Pod ${activePod} has produced no log output in the tail window.`}
        />
      ) : (
        <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
          {data.truncated ? (
            <div className="mb-2 text-muted-foreground">
              … showing the last {data.tail} lines
            </div>
          ) : null}
          {data.lines.join('\n')}
        </pre>
      )}
    </div>
  )
}

/**
 * Container: fetches a pod's log tail and renders the Logs tab body. Owns the
 * selected-pod state so the pod selector re-queries with `?node=<pod>`.
 */
export function ClusterLogsTab({ clusterId }: { clusterId: string }) {
  const [selectedPod, setSelectedPod] = useState<string>('')
  const query = useQuery({
    queryKey: ['clusters', clusterId, 'logs', selectedPod],
    queryFn: () =>
      api.clusterLogs(clusterId, selectedPod ? { node: selectedPod } : undefined),
    retry: false,
  })

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (query.isError) {
    return <ClusterTabError error={query.error} onRetry={() => query.refetch()} />
  }
  return (
    <LogsSection
      data={query.data}
      selectedPod={selectedPod}
      onSelectPod={setSelectedPod}
      onRefresh={() => query.refetch()}
      refreshing={query.isFetching}
    />
  )
}
