/**
 * The single source of truth for rendering `ClusterState`
 * (mobula-core `cluster.rs`, spec §1.4.1 and §6). The UI never invents
 * states — every badge maps 1:1 to one of these nine.
 */
export const CLUSTER_STATES = [
  'pending',
  'provisioning',
  'running',
  'degraded',
  'updating',
  'suspending',
  'suspended',
  'terminating',
  'terminated',
] as const

export type ClusterState = (typeof CLUSTER_STATES)[number]

/**
 * Color semantics from spec §6:
 * Running=green, Degraded=amber, Terminating/Suspending/Provisioning/Updating
 * =animated blue, Pending=grey, Suspended=grey-outline, Terminated=muted.
 */
export type ClusterStateTone =
  | 'success'
  | 'warning'
  | 'active'
  | 'neutral'
  | 'outline'
  | 'muted'

export interface ClusterStatePresentation {
  label: string
  tone: ClusterStateTone
  animated: boolean
  tooltip: string
}

const PRESENTATION: Record<ClusterState, ClusterStatePresentation> = {
  pending: {
    label: 'Pending',
    tone: 'neutral',
    animated: false,
    tooltip: 'Waiting for the provisioner to pick up the spec.',
  },
  provisioning: {
    label: 'Provisioning',
    tone: 'active',
    animated: true,
    tooltip: 'Infrastructure is being created.',
  },
  running: {
    label: 'Running',
    tone: 'success',
    animated: false,
    tooltip: 'Cluster is healthy and accepting work.',
  },
  degraded: {
    label: 'Degraded',
    tone: 'warning',
    animated: false,
    tooltip: 'Cluster is up, but observed state diverges from the desired spec.',
  },
  updating: {
    label: 'Updating',
    tone: 'active',
    animated: true,
    tooltip: 'A new spec generation is being reconciled.',
  },
  suspending: {
    label: 'Suspending',
    tone: 'active',
    animated: true,
    tooltip: 'Nodes are being drained and released.',
  },
  suspended: {
    label: 'Suspended',
    tone: 'outline',
    animated: false,
    tooltip:
      'Suspended → resuming reprovisions the cluster; there is no fast path to Running.',
  },
  terminating: {
    label: 'Terminating',
    tone: 'active',
    animated: true,
    tooltip: 'Cluster is being torn down. Terminated is terminal.',
  },
  terminated: {
    label: 'Terminated',
    tone: 'muted',
    animated: false,
    tooltip: 'Terminal state. The cluster no longer exists.',
  },
}

export function clusterStatePresentation(
  state: ClusterState,
): ClusterStatePresentation {
  return PRESENTATION[state]
}

export function isClusterState(value: unknown): value is ClusterState {
  return (
    typeof value === 'string' &&
    (CLUSTER_STATES as readonly string[]).includes(value)
  )
}
