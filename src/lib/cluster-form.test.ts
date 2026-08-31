import { describe, expect, it } from 'vitest'

import type { Identity } from './api'
import {
  buildCreateCluster,
  emptyClusterForm,
  emptyWorkerGroup,
  isValidQuantity,
  validateClusterForm,
} from './cluster-form'
import {
  canManageClusters,
  conditionPresentation,
  formatHourlyCost,
  generationDrift,
} from './clusters'

function identity(roles: Identity['roles']): Identity {
  return { subject: 's', groups: [], roles }
}

function validForm() {
  const form = emptyClusterForm()
  form.id = 'team-training'
  form.project = 'proj-a'
  form.workerGroups[0].name = 'gpu-workers'
  return form
}

describe('canManageClusters', () => {
  it('grants cluster mutations to operator and admin (api-v1.md §2.2)', () => {
    expect(canManageClusters(identity(['admin']))).toBe(true)
    expect(canManageClusters(identity(['operator']))).toBe(true)
    expect(canManageClusters(identity(['viewer', 'operator']))).toBe(true)
    // Developer is deliberately code-but-not-lifecycle (ADR-0009).
    expect(canManageClusters(identity(['developer']))).toBe(false)
    expect(canManageClusters(identity(['viewer']))).toBe(false)
    // Fail closed when there is no identity at all.
    expect(canManageClusters(null)).toBe(false)
  })
})

describe('isValidQuantity', () => {
  it('accepts the K8s quantity grammar (mobula-policy parse_quantity)', () => {
    for (const q of ['4', '500m', '512Mi', '1Gi', '2k', '1.5', '1e3', '5n', '1Ei']) {
      expect(isValidQuantity(q)).toBe(true)
    }
  })

  it('rejects non-quantities', () => {
    for (const q of ['', 'banana', '-3', '1GiB', 'Gi', '1.2.3']) {
      expect(isValidQuantity(q)).toBe(false)
    }
  })
})

describe('validateClusterForm', () => {
  it('accepts a complete form', () => {
    expect(validateClusterForm(validForm())).toEqual([])
  })

  it('rejects the empty form with actionable errors', () => {
    const errors = validateClusterForm(emptyClusterForm())
    expect(errors).toContain('Cluster name is required.')
    expect(errors).toContain('Project is required.')
    expect(errors.some((e) => e.includes('Worker group 1: name'))).toBe(true)
  })

  it('rejects min > max (backend 400 mirror)', () => {
    const form = validForm()
    form.workerGroups[0].minReplicas = '3'
    form.workerGroups[0].maxReplicas = '1'
    form.workerGroups[0].replicas = '2'
    const errors = validateClusterForm(form)
    expect(
      errors.some((e) => e.includes('min replicas (3) cannot exceed max replicas (1)')),
    ).toBe(true)
  })

  it('rejects replicas outside the min/max bounds', () => {
    const form = validForm()
    form.workerGroups[0].replicas = '9'
    expect(
      validateClusterForm(form).some((e) =>
        e.includes('replicas (9) must be between min (1) and max (4)'),
      ),
    ).toBe(true)
  })

  it('rejects bad quantities on head and worker-group resources', () => {
    const form = validForm()
    form.headCpu = 'two'
    form.workerGroups[0].memory = ''
    form.workerGroups[0].gpu = 'a-few'
    const errors = validateClusterForm(form)
    expect(errors.some((e) => e.includes('Head CPU "two"'))).toBe(true)
    expect(errors.some((e) => e.includes('memory "" is not a valid quantity'))).toBe(
      true,
    )
    expect(errors.some((e) => e.includes('GPU "a-few"'))).toBe(true)
  })

  it('requires at least one worker group', () => {
    const form = validForm()
    form.workerGroups = []
    expect(
      validateClusterForm(form).some((e) =>
        e.includes('At least one worker group'),
      ),
    ).toBe(true)
  })

  it('accepts an empty TTL and rejects a malformed one', () => {
    const form = validForm()
    expect(validateClusterForm(form)).toEqual([])
    form.ttlSeconds = '12.5'
    expect(
      validateClusterForm(form).some((e) => e.includes('TTL')),
    ).toBe(true)
    form.ttlSeconds = '3600'
    expect(validateClusterForm(form)).toEqual([])
  })
})

describe('buildCreateCluster', () => {
  it('builds the POST body, trimming and defaulting optional fields', () => {
    const form = validForm()
    form.id = ' team-training '
    form.workerGroups.push({
      ...emptyWorkerGroup(),
      name: 'cpu-workers',
      gpu: '2',
      minReplicas: '0',
      maxReplicas: '8',
      replicas: '2',
    })
    form.ttlSeconds = '86400'
    expect(buildCreateCluster(form)).toEqual({
      id: 'team-training',
      spec: {
        name: 'team-training',
        project: 'proj-a',
        engine: 'ray',
        rayVersion: '2.57.0',
        image: 'rayproject/ray:2.57.0',
        headCpu: '2',
        headMemory: '8Gi',
        ttlSeconds: 86400,
        workerGroups: [
          {
            name: 'gpu-workers',
            cpu: '4',
            memory: '16Gi',
            gpu: null,
            minReplicas: 1,
            maxReplicas: 4,
            replicas: 1,
          },
          {
            name: 'cpu-workers',
            cpu: '4',
            memory: '16Gi',
            gpu: '2',
            minReplicas: 0,
            maxReplicas: 8,
            replicas: 2,
          },
        ],
      },
    })
  })

  it('maps an empty TTL to null (reaping disabled)', () => {
    expect(buildCreateCluster(validForm()).spec.ttlSeconds).toBeNull()
  })

  it('carries the selected engine into the POST spec', () => {
    const ray = validForm()
    expect(buildCreateCluster(ray).spec.engine).toBe('ray')
    const dask = { ...validForm(), engine: 'dask' as const, image: 'ghcr.io/dask/dask:latest' }
    expect(buildCreateCluster(dask).spec.engine).toBe('dask')
  })
})

describe('validateClusterForm (engine-aware)', () => {
  it('does not require a Ray version for a Dask cluster', () => {
    const dask = {
      ...validForm(),
      engine: 'dask' as const,
      rayVersion: '',
      image: 'ghcr.io/dask/dask:latest',
    }
    expect(validateClusterForm(dask)).toEqual([])
  })

  it('still requires a Ray version for a Ray cluster', () => {
    const ray = { ...validForm(), rayVersion: '' }
    expect(validateClusterForm(ray)).toContain('Ray version is required.')
  })
})

describe('formatHourlyCost', () => {
  it('formats estimates and renders null as a placeholder', () => {
    expect(formatHourlyCost(1.5)).toBe('$1.50/hr')
    expect(formatHourlyCost(0)).toBe('$0.00/hr')
    expect(formatHourlyCost(null)).toBe('—')
    expect(formatHourlyCost(undefined)).toBe('—')
  })
})

describe('conditionPresentation', () => {
  it('curates the known alarms and passes unknown ones through', () => {
    expect(conditionPresentation('spec_drift')?.label).toBe('spec drift')
    expect(conditionPresentation('degraded')?.label).toBe('degraded')
    expect(conditionPresentation('future_alarm')?.label).toBe('future_alarm')
    expect(conditionPresentation(null)).toBeNull()
    expect(conditionPresentation(undefined)).toBeNull()
  })
})

describe('generationDrift', () => {
  it('is true only while observed lags the desired generation', () => {
    expect(generationDrift({ generation: 2, observedGeneration: 1 })).toBe(true)
    expect(generationDrift({ generation: 1, observedGeneration: 1 })).toBe(false)
  })
})
