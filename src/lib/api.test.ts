import { describe, expect, it } from 'vitest'

import { BifrostApiError, clusterViewState, rolesFromErrorBody } from './api'
import type { ClusterView } from './api'

function view(overrides: Partial<ClusterView> = {}): ClusterView {
  return {
    id: 'c1',
    project: 'demo',
    engine: 'ray',
    rayVersion: '2.57.0',
    generation: 1,
    observedGeneration: 1,
    desired: 'running',
    ...overrides,
  }
}

describe('rolesFromErrorBody', () => {
  it('extracts required/granted role from snake_case bodies (spec §5.10)', () => {
    expect(
      rolesFromErrorBody({
        error: 'forbidden',
        required_role: 'Admin',
        granted_role: 'viewer',
      }),
    ).toEqual({ requiredRole: 'admin', grantedRole: 'viewer' })
  })

  it('tolerates camelCase and missing fields', () => {
    expect(rolesFromErrorBody({ requiredRole: 'developer' })).toEqual({
      requiredRole: 'developer',
      grantedRole: undefined,
    })
    expect(rolesFromErrorBody('nope')).toEqual({})
    expect(rolesFromErrorBody(null)).toEqual({})
  })

  it('ignores roles the backend does not define', () => {
    expect(rolesFromErrorBody({ required_role: 'superuser' })).toEqual({
      requiredRole: undefined,
      grantedRole: undefined,
    })
  })
})

describe('BifrostApiError', () => {
  it('classifies 404 as not-implemented (Phase 3 API not landed)', () => {
    const err = new BifrostApiError({
      kind: 'http',
      status: 404,
      message: 'not found',
    })
    expect(err.isNotImplemented).toBe(true)
    expect(err.isUnreachable).toBe(false)
    expect(err.isForbidden).toBe(false)
  })

  it('classifies 403 with role context as forbidden', () => {
    const err = new BifrostApiError({
      kind: 'http',
      status: 403,
      message: 'forbidden',
      requiredRole: 'admin',
      grantedRole: 'viewer',
    })
    expect(err.isForbidden).toBe(true)
    expect(err.requiredRole).toBe('admin')
    expect(err.grantedRole).toBe('viewer')
  })

  it('classifies kind=network as unreachable', () => {
    const err = new BifrostApiError({
      kind: 'network',
      status: 0,
      message: 'connection refused',
    })
    expect(err.isUnreachable).toBe(true)
    expect(err.isNotImplemented).toBe(false)
  })

  it('treats 5xx as unavailable (dev proxy answers 500 when backend is down)', () => {
    expect(
      new BifrostApiError({ kind: 'http', status: 500, message: 'proxy error' })
        .isUnavailable,
    ).toBe(true)
    expect(
      new BifrostApiError({ kind: 'http', status: 502, message: 'bad gateway' })
        .isUnavailable,
    ).toBe(true)
    expect(
      new BifrostApiError({ kind: 'http', status: 404, message: 'not found' })
        .isUnavailable,
    ).toBe(false)
  })
})

describe('clusterViewState', () => {
  it('prefers observed_state when it is a known state', () => {
    expect(
      clusterViewState(view({ observedState: 'running', desired: 'suspended' })),
    ).toBe('running')
  })

  it('is pending until the reconciler has observed the cluster', () => {
    // `desired` is intent, not a lifecycle state. Rendering it as one made a
    // cluster that nothing had touched yet claim to be Running, tooltip and
    // all ("healthy and accepting work") — the badge a user reads before
    // pointing a job at it.
    expect(clusterViewState(view({ observedState: null, desired: 'running' }))).toBe(
      'pending',
    )
    expect(clusterViewState(view({ observedState: undefined, desired: 'suspended' }))).toBe(
      'pending',
    )
  })

  it('still reads an unobserved terminated record as a tombstone', () => {
    // The list partition hides tombstones behind a toggle, and a record whose
    // spec says terminated is one whether or not anything reconciled it.
    expect(clusterViewState(view({ observedState: null, desired: 'terminated' }))).toBe(
      'terminated',
    )
  })

  it('falls back to pending when observed_state is not a known state', () => {
    expect(clusterViewState(view({ observedState: 'gibberish', desired: 'nonsense' }))).toBe(
      'pending',
    )
  })
})
