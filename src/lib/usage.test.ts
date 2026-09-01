import { describe, expect, it } from 'vitest'

import type { UsageReport } from './api'
import {
  formatCostUsd,
  formatResourceHours,
  sumResourceHours,
  usageWindow,
} from './usage'

describe('usageWindow', () => {
  it('computes from/to in unix seconds', () => {
    const now = 1_755_366_400_000
    expect(usageWindow(3_600, now)).toEqual({
      from: 1_755_366_400 - 3_600,
      to: 1_755_366_400,
    })
  })
})

describe('formatResourceHours', () => {
  it('renders known resources readably', () => {
    expect(formatResourceHours('cpu', 4.667)).toBe('4.67 CPU-hours')
    expect(formatResourceHours('nvidia.com/gpu', 0.5)).toBe('0.5 GPU-hours')
  })

  it('keeps unknown resource keys as-is', () => {
    expect(formatResourceHours('custom.io/widget', 2)).toBe(
      '2 custom.io/widget-hours',
    )
  })
})

describe('formatCostUsd', () => {
  it('renders null (no price sheet) as a dash', () => {
    expect(formatCostUsd(null)).toBe('—')
    expect(formatCostUsd(undefined)).toBe('—')
    expect(formatCostUsd(0.2933)).toBe('$0.29')
  })
})

describe('sumResourceHours', () => {
  const report = (groups: UsageReport['groups']): UsageReport => ({
    from: 0,
    to: 86_400,
    groups,
    budgets: [],
  })

  it('sums per-project rows and ignores the overlapping pool-total row', () => {
    const r = report([
      { project: 'proj-a', pool: 'gpu', resourceHours: { cpu: 4 } },
      { project: 'proj-b', pool: 'gpu', resourceHours: { cpu: 6 } },
      // project '' = pool-level aggregate; overlaps the rows above.
      { project: '', pool: 'gpu', resourceHours: { cpu: 10 } },
    ])
    expect(sumResourceHours(r, 'cpu')).toBe(10)
  })

  it('falls back to aggregate rows when no per-project rows exist', () => {
    const r = report([
      { project: '', pool: 'gpu', resourceHours: { 'nvidia.com/gpu': 2.5 } },
    ])
    expect(sumResourceHours(r, 'nvidia.com/gpu')).toBe(2.5)
  })

  it('returns undefined when the resource never appears', () => {
    const r = report([
      { project: 'proj-a', pool: 'gpu', resourceHours: { cpu: 4 } },
    ])
    expect(sumResourceHours(r, 'nvidia.com/gpu')).toBeUndefined()
    expect(sumResourceHours(report([]), 'cpu')).toBeUndefined()
  })
})
