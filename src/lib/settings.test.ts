import { describe, expect, it } from 'vitest'

import type { Identity } from './api'
import {
  canEditPolicy,
  formatAmount,
  formatQuotaLimits,
  priceUnitLabel,
  pricesToRows,
  rowsToAmounts,
  sourceBadge,
  withProjectQuota,
} from './settings'

describe('rowsToAmounts (form rows → wire map)', () => {
  it('parses valid rows and drops empty ones', () => {
    expect(
      rowsToAmounts(
        [
          { key: 'cpu', value: '0.048' },
          { key: '', value: '' },
          { key: ' nvidia.com/gpu ', value: '2.8' },
        ],
        'price',
      ),
    ).toEqual({ cpu: 0.048, 'nvidia.com/gpu': 2.8 })
  })

  it('rejects a non-numeric amount, naming the key like the backend 400', () => {
    expect(rowsToAmounts([{ key: 'cpu', value: 'abc' }], 'price')).toBe(
      'invalid price for "cpu": must be a non-negative finite number',
    )
  })

  it('rejects negative and non-finite amounts', () => {
    expect(rowsToAmounts([{ key: 'cpu', value: '-1' }], 'price')).toBe(
      'invalid price for "cpu": must be a non-negative finite number',
    )
    // Number('1e999') === Infinity — non-finite.
    expect(rowsToAmounts([{ key: 'cpu', value: '1e999' }], 'quota')).toBe(
      'invalid quota for "cpu": must be a non-negative finite number',
    )
  })

  it('rejects a keyed row with an empty value, and a value with no key', () => {
    expect(rowsToAmounts([{ key: 'cpu', value: '' }], 'price')).toBe(
      'invalid price for "cpu": must be a non-negative finite number',
    )
    expect(rowsToAmounts([{ key: '', value: '5' }], 'quota')).toBe(
      'quota row is missing a resource key',
    )
  })

  it('accepts zero (non-negative, not positive)', () => {
    expect(rowsToAmounts([{ key: 'cpu', value: '0' }], 'price')).toEqual({ cpu: 0 })
  })
})

describe('pricesToRows', () => {
  it('maps wire prices to string rows and back', () => {
    const rows = pricesToRows({ cpu: 0.048, memory: 0.006 })
    expect(rows).toEqual([
      { key: 'cpu', value: '0.048' },
      { key: 'memory', value: '0.006' },
    ])
    expect(rowsToAmounts(rows, 'price')).toEqual({ cpu: 0.048, memory: 0.006 })
  })

  it('maps a null sheet to no rows (editor starts empty)', () => {
    expect(pricesToRows(null)).toEqual([])
  })
})

describe('withProjectQuota (client-side merge for the section-replace PUT)', () => {
  const current = { 'ml-team': { cpu: 500 }, 'data-eng': { cpu: 100 } }

  it('replaces one project, keeping the others', () => {
    expect(withProjectQuota(current, 'ml-team', { cpu: 750, 'nvidia.com/gpu': 8 })).toEqual({
      'ml-team': { cpu: 750, 'nvidia.com/gpu': 8 },
      'data-eng': { cpu: 100 },
    })
  })

  it('adds a new project without disturbing existing ones', () => {
    expect(withProjectQuota(current, 'research', { memory: 1024 })).toEqual({
      ...current,
      research: { memory: 1024 },
    })
  })

  it('deletes the project on null or empty resources', () => {
    expect(withProjectQuota(current, 'ml-team', null)).toEqual({
      'data-eng': { cpu: 100 },
    })
    expect(withProjectQuota(current, 'ml-team', {})).toEqual({
      'data-eng': { cpu: 100 },
    })
  })
})

describe('formatting and badges', () => {
  it('formatAmount renders integers with separators and floats raw', () => {
    expect(formatAmount(500)).toBe('500')
    expect(formatAmount(1024)).toBe('1,024')
    expect(formatAmount(2.5)).toBe('2.5')
  })

  it('formatQuotaLimits renders the compact map style', () => {
    expect(formatQuotaLimits({ cpu: 500, 'nvidia.com/gpu': 8 })).toBe(
      'cpu=500, nvidia.com/gpu=8',
    )
    expect(formatQuotaLimits({})).toBe('—')
  })

  it('priceUnitLabel labels known keys and passes unknown ones raw', () => {
    expect(priceUnitLabel('cpu')).toBe('$/core-hour')
    expect(priceUnitLabel('memory')).toBe('$/GiB-hour')
    expect(priceUnitLabel('nvidia.com/gpu')).toBe('$/GPU-hour')
    expect(priceUnitLabel('custom.io/widget')).toBe('$/unit-hour')
  })

  it('sourceBadge names the provenance', () => {
    expect(sourceBadge('file')).toBe('from policy file')
    expect(sourceBadge('store')).toBe('saved to store')
    expect(sourceBadge('none')).toBe('not configured')
  })
})

describe('canEditPolicy', () => {
  const admin: Identity = { subject: 'a', groups: [], roles: ['admin'] }
  it('gates the page to admins and fails closed', () => {
    expect(canEditPolicy(admin)).toBe(true)
    expect(canEditPolicy({ subject: 'o', groups: [], roles: ['operator'] })).toBe(false)
    expect(canEditPolicy(null)).toBe(false)
  })
})
