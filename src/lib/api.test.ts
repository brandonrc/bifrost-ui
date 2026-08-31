import { describe, expect, it } from 'vitest'

import { MobulaApiError, clusterViewState, rolesFromErrorBody } from './api'
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

describe('MobulaApiError', () => {
  it('classifies 404 as not-implemented (Phase 3 API not landed)', () => {
    const err = new MobulaApiError({
      kind: 'http',
      status: 404,
      message: 'not found',
    })
    expect(err.isNotImplemented).toBe(true)
    expect(err.isUnreachable).toBe(false)
    expect(err.isForbidden).toBe(false)
  })

  it('classifies 403 with role context as forbidden', () => {
    const err = new MobulaApiError({
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
    const err = new MobulaApiError({
      kind: 'network',
      status: 0,
      message: 'connection refused',
    })
    expect(err.isUnreachable).toBe(true)
    expect(err.isNotImplemented).toBe(false)
  })

  it('treats 5xx as unavailable (dev proxy answers 500 when backend is down)', () => {
    expect(
      new MobulaApiError({ kind: 'http', status: 500, message: 'proxy error' })
        .isUnavailable,
    ).toBe(true)
    expect(
      new MobulaApiError({ kind: 'http', status: 502, message: 'bad gateway' })
        .isUnavailable,
    ).toBe(true)
    expect(
      new MobulaApiError({ kind: 'http', status: 404, message: 'not found' })
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

  it('falls back to desired before the cluster is first observed', () => {
    expect(clusterViewState(view({ observedState: null, desired: 'provisioning' }))).toBe(
      'provisioning',
    )
    expect(clusterViewState(view({ observedState: undefined, desired: 'terminating' }))).toBe(
      'terminating',
    )
  })

  it('falls back to pending when neither is a known state', () => {
    expect(clusterViewState(view({ observedState: 'gibberish', desired: 'nonsense' }))).toBe(
      'pending',
    )
  })
})
