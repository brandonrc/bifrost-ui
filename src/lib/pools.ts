import type { CreatePool, FlavorSpec, Identity } from './api'

/**
 * Pools & allocations are platform configuration (api-v1.md §2.2): reads are
 * Viewer+, mutations are Admin-only. The dev identity is admin, so every
 * affordance renders in dev; in real auth a non-admin sees them disabled.
 */
export function canWritePools(identity: Identity | null): boolean {
  return identity?.roles.includes('admin') ?? false
}

/** Compact rendering of a resource map: `cpu=8, nvidia.com/gpu=4`. */
export function formatResourceMap(map: Record<string, string>): string {
  const entries = Object.entries(map)
  if (entries.length === 0) return '—'
  return entries.map(([key, value]) => `${key}=${value}`).join(', ')
}

/**
 * Human rendering of one parsed resource amount. The pool-usage API flattens
 * K8s quantities to plain numbers, so memory arrives in bytes ("192Gi" →
 * 206158430208) — render memory-ish keys in GiB once they're big enough for
 * raw bytes to be unreadable. Everything else passes through verbatim.
 */
export function formatResourceAmount(key: string, value: number): string {
  if (/memory/i.test(key) && value >= 1e9) {
    return `${(value / 2 ** 30).toFixed(0)}Gi`
  }
  return String(value)
}

// --- New-pool form state (route /pools/new) --------------------------------

/** One editable key→value row (flavor resources, node labels). */
export interface PairRow {
  key: string
  value: string
}

export interface FlavorRow {
  name: string
  resources: PairRow[]
  nodeLabels: PairRow[]
}

export interface PoolFormState {
  name: string
  cohort: string
  elastic: boolean
  /** Kept as a string so the input can be empty/partial while typing. */
  fairSharingWeight: string
  flavors: FlavorRow[]
}

export function emptyFlavor(): FlavorRow {
  return { name: '', resources: [{ key: '', value: '' }], nodeLabels: [] }
}

export function emptyPoolForm(): PoolFormState {
  return {
    name: '',
    cohort: '',
    elastic: false,
    fairSharingWeight: '1',
    flavors: [emptyFlavor()],
  }
}

/** Client-side validation mirroring the backend's 400s (api-v1.md §5.12). */
export function validatePoolForm(state: PoolFormState): string[] {
  const errors: string[] = []
  if (state.name.trim() === '') errors.push('Pool name is required.')
  if (state.cohort.trim() === '') errors.push('Cohort is required.')
  const weight = Number(state.fairSharingWeight)
  if (state.fairSharingWeight.trim() === '' || !Number.isFinite(weight) || weight <= 0) {
    errors.push('Fair-sharing weight must be a positive number.')
  }
  if (state.flavors.length === 0) {
    errors.push('At least one flavor is required.')
  }
  state.flavors.forEach((flavor, i) => {
    const label = `Flavor ${i + 1}`
    if (flavor.name.trim() === '') errors.push(`${label}: name is required.`)
    const resources = flavor.resources.filter((r) => r.key.trim() !== '')
    if (resources.length === 0) {
      errors.push(`${label}: at least one resource quota is required.`)
    }
    for (const row of resources) {
      if (row.value.trim() === '') {
        errors.push(`${label}: resource "${row.key}" needs a quantity.`)
      }
    }
    for (const row of flavor.nodeLabels) {
      if (row.key.trim() === '' && row.value.trim() !== '') {
        errors.push(`${label}: node label "${row.value}" is missing its key.`)
      }
    }
  })
  return errors
}

/** Convert non-empty key rows to a wire map. */
export function pairsToMap(rows: PairRow[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key !== '') map[key] = row.value.trim()
  }
  return map
}

/** Convert validated form state into the `POST /api/v1/pools` body. */
export function buildCreatePool(state: PoolFormState): CreatePool {
  const flavors: FlavorSpec[] = state.flavors.map((flavor) => ({
    name: flavor.name.trim(),
    resources: pairsToMap(flavor.resources),
    nodeLabels: pairsToMap(flavor.nodeLabels),
    taints: [],
  }))
  return {
    spec: {
      name: state.name.trim(),
      cohort: state.cohort.trim(),
      elastic: state.elastic,
      fairSharingWeight: Number(state.fairSharingWeight),
      flavors,
    },
  }
}
