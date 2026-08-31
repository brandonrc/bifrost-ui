import { describe, expect, it } from 'vitest'

import {
  defaultImageFor,
  engineHasJobsApi,
  engineHasServices,
  engineLabel,
  headRoleLabel,
  normalizeEngine,
} from './engine'

describe('normalizeEngine', () => {
  it('reads "dask" as Dask and everything else as Ray (backend default)', () => {
    expect(normalizeEngine('dask')).toBe('dask')
    expect(normalizeEngine('ray')).toBe('ray')
    // Unknown / missing / wrong-typed values fall back to Ray.
    expect(normalizeEngine(undefined)).toBe('ray')
    expect(normalizeEngine(null)).toBe('ray')
    expect(normalizeEngine('DASK')).toBe('ray')
    expect(normalizeEngine(42)).toBe('ray')
  })
})

describe('engine presentation helpers', () => {
  it('labels each engine', () => {
    expect(engineLabel('ray')).toBe('Ray')
    expect(engineLabel('dask')).toBe('Dask')
  })

  it('names the head role per engine (head vs scheduler)', () => {
    expect(headRoleLabel('ray')).toBe('Head node')
    expect(headRoleLabel('dask')).toBe('Scheduler')
  })

  it('marks Jobs and Services as Ray-only surfaces', () => {
    expect(engineHasJobsApi('ray')).toBe(true)
    expect(engineHasJobsApi('dask')).toBe(false)
    expect(engineHasServices('ray')).toBe(true)
    expect(engineHasServices('dask')).toBe(false)
  })

  it('defaults the image per engine', () => {
    expect(defaultImageFor('ray')).toContain('rayproject/ray')
    expect(defaultImageFor('dask')).toContain('dask')
  })
})
