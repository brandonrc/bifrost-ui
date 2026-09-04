import { holdsRole } from './identity'
import type { Identity, ServiceView } from './api'
import { isClusterState, type ClusterState } from './cluster-state'

/**
 * Service deploy/update/delete need `Write` on `Target::Service` — Developer
 * or Admin (the backend Role::grants: deploying a Serve app is "code",
 * unlike cluster lifecycle which is Operator/Admin). Reads are Viewer+ and
 * never gated. Fails closed on null identity.
 */
export function canManageServices(identity: Identity | null): boolean {
  // Held globally or in any project — same reasoning as canManageClusters.
  return holdsRole(identity, ['developer', 'admin'])
}

/**
 * A `ServiceView`'s state for display. The backend reuses the cluster
 * lifecycle enum for observed service state (`ObservedService.state` is a
 * `ClusterState` serialized snake_case), so the same nine badge variants
 * apply; anything unrecognized falls back to `pending` rather than crashing
 * on a state the UI predates.
 */
export function serviceViewState(view: ServiceView): ClusterState {
  return isClusterState(view.state) ? view.state : 'pending'
}
