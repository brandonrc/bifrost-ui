import { describe, expect, it } from 'vitest'

import type { ClusterView } from './api'
import { isTerminated, partitionTerminated } from './clusters'

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

describe('isTerminated', () => {
  it('is true when observed_state is terminated', () => {
    expect(isTerminated(view({ observedState: 'terminated' }))).toBe(true)
  })

  it('falls back to desired when observed_state is unset (mirrors the badge)', () => {
    expect(
      isTerminated(view({ observedState: null, desired: 'terminated' })),
    ).toBe(true)
    expect(
      isTerminated(view({ observedState: undefined, desired: 'terminated' })),
    ).toBe(true)
  })

  it('is false for live states', () => {
    expect(isTerminated(view({ observedState: 'running' }))).toBe(false)
    expect(isTerminated(view({ observedState: 'terminating' }))).toBe(false)
    expect(isTerminated(view({ observedState: 'suspended' }))).toBe(false)
  })
})

describe('partitionTerminated', () => {
  it('splits tombstones out of the default list, preserving order', () => {
    const clusters = [
      view({ id: 'ray-live', observedState: 'running' }),
      view({ id: 'sess-bob-dask', observedState: 'terminated' }),
      view({ id: 'dask-live', observedState: 'running' }),
      view({ id: 'old', observedState: null, desired: 'terminated' }),
    ]

    const { active, terminated } = partitionTerminated(clusters)

    expect(active.map((c) => c.id)).toEqual(['ray-live', 'dask-live'])
    expect(terminated.map((c) => c.id)).toEqual(['sess-bob-dask', 'old'])
  })

  it('handles an empty list and an all-terminated list', () => {
    expect(partitionTerminated([])).toEqual({ active: [], terminated: [] })

    const allDead = [view({ observedState: 'terminated' })]
    const { active, terminated } = partitionTerminated(allDead)
    expect(active).toHaveLength(0)
    expect(terminated).toHaveLength(1)
  })
})
