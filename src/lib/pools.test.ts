import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'
import type { Identity } from './api'
import {
  buildCreatePool,
  formatResourceAmount,
  canWritePools,
  emptyPoolForm,
  formatResourceMap,
  validatePoolForm,
} from './pools'

function identity(roles: Identity['roles']): Identity {
  return { subject: 's', groups: [], roles }
}

describe('canWritePools', () => {
  it('grants pool mutations to admin only (api-v1.md §2.2)', () => {
    expect(canWritePools(identity(['admin']))).toBe(true)
    expect(canWritePools(identity(['viewer', 'admin']))).toBe(true)
    expect(canWritePools(identity(['operator']))).toBe(false)
    expect(canWritePools(identity(['viewer', 'developer']))).toBe(false)
    // Fail closed when there is no identity at all.
    expect(canWritePools(null)).toBe(false)
  })
})

describe('formatResourceMap', () => {
  it('renders resource maps compactly', () => {
    expect(formatResourceMap({ cpu: '8', 'nvidia.com/gpu': '4' })).toBe(
      'cpu=8, nvidia.com/gpu=4',
    )
  })

  it('renders empty maps as a placeholder', () => {
    expect(formatResourceMap({})).toBe('—')
  })
})

describe('validatePoolForm', () => {
  it('rejects the empty form with actionable errors', () => {
    const errors = validatePoolForm({
      ...emptyPoolForm(),
      fairSharingWeight: '',
    })
    expect(errors).toContain('Pool name is required.')
    expect(errors).toContain('Cohort is required.')
    expect(
      errors.some((e) => e.includes('Fair-sharing weight')),
    ).toBe(true)
    expect(errors.some((e) => e.includes('Flavor 1: name is required.'))).toBe(
      true,
    )
  })

  it('rejects a resource row with a key but no quantity', () => {
    const form = emptyPoolForm()
    form.name = 'gpu-pool'
    form.cohort = 'team'
    form.flavors[0].name = 'a100'
    form.flavors[0].resources = [{ key: 'cpu', value: '' }]
    expect(
      validatePoolForm(form).some((e) =>
        e.includes('resource "cpu" needs a quantity'),
      ),
    ).toBe(true)
  })

  it('accepts a complete form', () => {
    const form = emptyPoolForm()
    form.name = 'gpu-pool'
    form.cohort = 'team'
    form.flavors[0].name = 'a100'
    form.flavors[0].resources = [{ key: 'cpu', value: '8' }]
    expect(validatePoolForm(form)).toEqual([])
  })
})

describe('buildCreatePool', () => {
  it('builds the POST body, trimming and dropping empty rows', () => {
    const form = emptyPoolForm()
    form.name = ' gpu-pool '
    form.cohort = 'team'
    form.fairSharingWeight = '2.5'
    form.flavors[0].name = 'a100'
    form.flavors[0].resources = [
      { key: 'cpu', value: '8' },
      { key: '', value: 'ignored' },
    ]
    form.flavors[0].nodeLabels = [
      { key: 'cloud.google.com/gke-accelerator', value: 'nvidia-tesla-a100' },
    ]
    expect(buildCreatePool(form)).toEqual({
      spec: {
        name: 'gpu-pool',
        cohort: 'team',
        elastic: false,
        fairSharingWeight: 2.5,
        flavors: [
          {
            name: 'a100',
            resources: { cpu: '8' },
            nodeLabels: {
              'cloud.google.com/gke-accelerator': 'nvidia-tesla-a100',
            },
            taints: [],
          },
        ],
      },
    })
  })
})

describe('api.pools (mocked client transport)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses the bare-array wire shape (snake_case) into PoolViews', async () => {
    const wire = [
      {
        name: 'gpu-pool',
        generation: 3,
        created_at: 1_755_280_000,
        cohort: 'team',
        fair_sharing_weight: 1,
        elastic: true,
        flavors: [
          { name: 'a100', resources: { cpu: '8' }, node_labels: {}, taints: [] },
        ],
        total_nominal: { cpu: '8', 'nvidia.com/gpu': '4' },
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(wire), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pools = await api.pools()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/pools')
    expect(pools).toHaveLength(1)
    expect(pools[0].name).toBe('gpu-pool')
    expect(pools[0].fairSharingWeight).toBe(1)
    expect(pools[0].totalNominal).toEqual({ cpu: '8', 'nvidia.com/gpu': '4' })
  })
})

describe('formatResourceAmount', () => {
  it('renders big memory values as GiB and passes the rest through', () => {
    expect(formatResourceAmount('memory', 223338299392)).toBe('208Gi')
    expect(formatResourceAmount('memory', 536870912)).toBe('536870912')
    expect(formatResourceAmount('cpu', 52)).toBe('52')
    expect(formatResourceAmount('nvidia.com/gpu', 6)).toBe('6')
  })
})
