import { clusterViewState } from './api'
import { holdsRole } from './identity'
import type { ClusterView, Identity } from './api'

/**
 * Cluster lifecycle mutations (create, terminate) need `Write`/`Delete` on
 * `Target::Cluster` — Operator or Admin (api-v1.md §2.2, ADR-0009). Developer
 * is deliberately code-but-not-lifecycle. Reads are Viewer+ and never gated.
 * Fails closed on null identity.
 *
 * A grant counts wherever it is held. This used to read `identity.roles`
 * alone, which lists *global* roles only, so a project operator — the ordinary
 * self-serve user, whose grant comes from a group or an assignment scoped to
 * their project — was shown "Operator or Admin role required" for a cluster
 * the control plane would have let them create. The dashboard was guessing at
 * authority the server can state; `identity.projects` is that statement.
 */
export function canManageClusters(identity: Identity | null): boolean {
  return holdsRole(identity, ['operator', 'admin'])
}

/**
 * `$1.25/hr` for a configured estimate; `—` when the control plane has no
 * price sheet (`est_*_hourly` null — see `PolicyConfig.prices`).
 */
export function formatHourlyCost(value: number | null | undefined): string {
  if (value == null) return '—'
  return `$${value.toFixed(2)}/hr`
}

export interface ConditionPresentation {
  label: string
  tooltip: string
}

/**
 * The reconcile engine's drift/health alarm (ADR-0004), distinct from
 * `observed_state`. Known conditions get a curated tooltip; unknown ones
 * pass through verbatim so a future condition never renders blank.
 */
export function conditionPresentation(
  condition: string | null | undefined,
): ConditionPresentation | null {
  switch (condition) {
    case 'spec_drift':
      return {
        label: 'spec drift',
        tooltip:
          'The cluster was edited out of band and no longer matches the desired spec.',
      }
    case 'degraded':
      return {
        label: 'degraded',
        tooltip:
          'The reconcile engine reports this cluster is not fully healthy.',
      }
    default:
      return condition
        ? { label: condition, tooltip: 'Alarm raised by the reconcile engine.' }
        : null
  }
}

/**
 * True while the reconcile engine hasn't caught up to the desired spec
 * (`generation` bumped, `observed_generation` lagging) — the "reconcile in
 * progress" signal from spec §5.4.
 */
export function generationDrift(
  view: Pick<ClusterView, 'generation' | 'observedGeneration'>,
): boolean {
  return view.generation !== view.observedGeneration
}

/**
 * A cluster is a "tombstone" once its rendered lifecycle state is
 * `terminated` — the terminal state where the cluster no longer exists
 * (cluster-state.ts). Resolution matches every badge in the UI
 * (`clusterViewState`: observed_state, else desired, else pending), so a
 * cluster the reconciler has torn down but whose spec still reads
 * `terminated` counts either way.
 */
export function isTerminated(view: ClusterView): boolean {
  return clusterViewState(view) === 'terminated'
}

export interface ClusterPartition {
  /** Clusters shown by default (everything that is not a tombstone). */
  active: ClusterView[]
  /** Terminated tombstones, hidden until "Show terminated" is toggled on. */
  terminated: ClusterView[]
}

/**
 * Split clusters into the ones shown by default and the terminated
 * tombstones hidden behind the "Show terminated" toggle. Order within each
 * bucket is preserved from the source list.
 */
export function partitionTerminated(clusters: ClusterView[]): ClusterPartition {
  const active: ClusterView[] = []
  const terminated: ClusterView[] = []
  for (const view of clusters) {
    if (isTerminated(view)) terminated.push(view)
    else active.push(view)
  }
  return { active, terminated }
}
