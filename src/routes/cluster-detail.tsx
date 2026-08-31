import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useCanManageClusters } from '@/auth/permissions'
import {
  ClusterEventsTab,
  ClusterJobsTab,
  ClusterLogsTab,
  ClusterMetricsTab,
  ClusterNodesTab,
} from '@/components/cluster-tabs'
import { ClusterStateBadge } from '@/components/cluster-state-badge'
import { EngineBadge } from '@/components/engine-badge'
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
import { api, clusterViewState } from '@/lib/api'
import type { ClusterView } from '@/lib/api'
import {
  conditionPresentation,
  formatHourlyCost,
  generationDrift,
} from '@/lib/clusters'
import { cn } from '@/lib/utils'

/**
 * Tab layout from spec §5.4. Overview (`GET /api/v1/clusters/{id}`), Nodes
 * (`.../nodes`), Jobs (`.../jobs`), Events (`.../events`), Metrics
 * (`.../metrics`) and Logs (`.../logs`) are all backed today; only Config
 * remains specced-but-unbacked, so it renders an explicit pending-backend
 * empty state rather than a mock.
 */
const TABS = [
  { id: 'overview', label: 'Overview', note: '' },
  { id: 'nodes', label: 'Nodes', note: '' },
  { id: 'jobs', label: 'Jobs', note: '' },
  { id: 'logs', label: 'Logs', note: '' },
  { id: 'metrics', label: 'Metrics', note: '' },
  { id: 'events', label: 'Events', note: '' },
  { id: 'config', label: 'Config', note: 'Effective spec view + edit-via-wizard. Pending backend — ClusterView does not carry the full spec yet (api-v1.md §3.4 adds it) and PATCH /api/v1/clusters/{id} is Milestone B.' },
] as const

type TabId = (typeof TABS)[number]['id']

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}

function OverviewTab({ cluster }: { cluster: ClusterView }) {
  const condition = conditionPresentation(cluster.condition)
  const drift = generationDrift(cluster)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>State</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Observed state"
            value={
              cluster.observedState ? (
                <ClusterStateBadge state={clusterViewState(cluster)} />
              ) : (
                <span className="text-muted-foreground">
                  not reconciled yet
                </span>
              )
            }
          />
          <Field label="Desired" value={cluster.desired} />
          <Field
            label="Spec generation"
            value={
              <span className="font-mono text-xs">{cluster.generation}</span>
            }
          />
          <Field
            label="Observed generation"
            value={
              <span className="font-mono text-xs">
                {cluster.observedGeneration}
                {drift ? (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    reconcile in progress
                  </span>
                ) : null}
              </span>
            }
          />
          <Field
            label="Condition"
            value={
              condition ? (
                <Badge variant="outline" title={condition.tooltip}>
                  <TriangleAlert className="text-amber-500" aria-hidden />
                  {condition.label}
                </Badge>
              ) : (
                <span className="text-muted-foreground">none</span>
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spec metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" value={cluster.project} />
          <Field label="Engine" value={<EngineBadge engine={cluster.engine} />} />
          {cluster.engine === 'ray' ? (
            <Field
              label="Ray version"
              value={
                <span className="font-mono text-xs">{cluster.rayVersion}</span>
              }
            />
          ) : null}
          <Field
            label="Est. min cost"
            value={formatHourlyCost(cluster.estMinHourly)}
          />
          <Field
            label="Est. max cost"
            value={formatHourlyCost(cluster.estMaxHourly)}
          />
        </CardContent>
      </Card>

      {cluster.estMinHourly == null && cluster.estMaxHourly == null ? (
        <p className="text-xs text-muted-foreground lg:col-span-2">
          Cost estimates need a price sheet configured on the control plane
          (PolicyConfig.prices) — none is set, so estimates are unavailable.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Cluster detail (spec §5.4), backed by the implemented
 * `GET /api/v1/clusters/{id}`. ClusterView is metadata-only today (no full
 * spec, no created_at — api-v1.md §3.4 adds both), so Overview renders the
 * fields the wire actually has. Terminate is the one implemented lifecycle
 * action; Suspend/Resume/Edit remain pending backend (Milestone B).
 */
export function ClusterDetailPage() {
  const { clusterId = '' } = useParams<{ clusterId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canManage = useCanManageClusters()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [confirmTerminate, setConfirmTerminate] = useState(false)
  const [terminateError, setTerminateError] = useState<string | null>(null)
  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  const query = useQuery({
    queryKey: ['clusters', clusterId],
    queryFn: () => api.cluster(clusterId),
    retry: false,
    refetchInterval: 15_000,
  })

  const terminateMutation = useMutation({
    mutationFn: () => api.deleteCluster(clusterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] })
      navigate('/clusters')
    },
    onError: (err) => {
      setTerminateError(err instanceof Error ? err.message : String(err))
    },
  })

  if (query.isError) {
    return (
      <>
        <PageHeader title={`Cluster ${clusterId}`} />
        <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    )
  }

  const cluster = query.data
  const condition = cluster ? conditionPresentation(cluster.condition) : null
  const drift = cluster ? generationDrift(cluster) : false

  return (
    <>
      <PageHeader
        title={cluster ? `Cluster ${cluster.id}` : `Cluster ${clusterId}`}
        description={
          cluster ? (
            <span className="flex flex-wrap items-center gap-2">
              <ClusterStateBadge state={clusterViewState(cluster)} />
              <EngineBadge engine={cluster.engine} />
              <Badge variant="outline">project {cluster.project}</Badge>
              {cluster.engine === 'ray' ? (
                <Badge variant="outline">ray {cluster.rayVersion}</Badge>
              ) : null}
              <Badge variant="outline" title="spec generation → observed generation">
                gen {cluster.generation} → {cluster.observedGeneration}
              </Badge>
              {drift ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 text-amber-600 dark:text-amber-400"
                >
                  reconcile in progress
                </Badge>
              ) : null}
              {condition ? (
                <Badge
                  variant="outline"
                  title={condition.tooltip}
                  className="border-amber-500/50 text-amber-600 dark:text-amber-400"
                >
                  <TriangleAlert className="text-amber-500" aria-hidden />
                  {condition.label}
                </Badge>
              ) : null}
            </span>
          ) : undefined
        }
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/clusters">All clusters</Link>
            </Button>
            {canManage ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setTerminateError(null)
                  setConfirmTerminate(true)
                }}
              >
                Terminate
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
              t.id === activeTab &&
                'border-primary font-medium text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : cluster && activeTab === 'overview' ? (
        <OverviewTab cluster={cluster} />
      ) : cluster && activeTab === 'nodes' ? (
        <ClusterNodesTab clusterId={clusterId} engine={cluster.engine} />
      ) : cluster && activeTab === 'jobs' ? (
        <ClusterJobsTab clusterId={clusterId} engine={cluster.engine} />
      ) : cluster && activeTab === 'events' ? (
        <ClusterEventsTab clusterId={clusterId} />
      ) : cluster && activeTab === 'metrics' ? (
        <ClusterMetricsTab clusterId={clusterId} />
      ) : cluster && activeTab === 'logs' ? (
        <ClusterLogsTab clusterId={clusterId} />
      ) : (
        <EmptyState
          title={`${tab.label} — pending backend`}
          description={tab.note}
        />
      )}

      <Dialog
        open={confirmTerminate}
        onOpenChange={(open) => {
          if (!open) setConfirmTerminate(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminate cluster {clusterId}?</DialogTitle>
            <DialogDescription>
              The cluster is marked for termination and the reconcile engine
              tears it down (DELETE returns 202). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {terminateError ? (
            <p className="text-sm text-destructive">{terminateError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmTerminate(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={terminateMutation.isPending}
              onClick={() => terminateMutation.mutate()}
            >
              {terminateMutation.isPending ? 'Terminating…' : 'Terminate cluster'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
