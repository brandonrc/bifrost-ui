import { describe, expect, it } from 'vitest'

import {
  CLUSTER_STATES,
  clusterStatePresentation,
  isClusterState,
} from './cluster-state'

describe('clusterStatePresentation', () => {
  it('covers exactly the 9 backend ClusterState variants (spec §1.4.1)', () => {
    expect(CLUSTER_STATES).toHaveLength(9)
    for (const state of CLUSTER_STATES) {
      const presentation = clusterStatePresentation(state)
      expect(presentation.label).toBeTruthy()
      expect(presentation.tooltip).toBeTruthy()
    }
  })

  it('maps color semantics per spec §6', () => {
    expect(clusterStatePresentation('running').tone).toBe('success')
    expect(clusterStatePresentation('degraded').tone).toBe('warning')
    expect(clusterStatePresentation('pending').tone).toBe('neutral')
    expect(clusterStatePresentation('suspended').tone).toBe('outline')
    expect(clusterStatePresentation('terminated').tone).toBe('muted')
  })

  it('marks transitional states as animated blue', () => {
    for (const state of [
      'provisioning',
      'updating',
      'suspending',
      'terminating',
    ] as const) {
      const presentation = clusterStatePresentation(state)
      expect(presentation.tone).toBe('active')
      expect(presentation.animated).toBe(true)
    }
  })

  it('rejects states the backend does not define', () => {
    expect(isClusterState('running')).toBe(true)
    expect(isClusterState('paused')).toBe(false)
    expect(isClusterState(undefined)).toBe(false)
  })
})
