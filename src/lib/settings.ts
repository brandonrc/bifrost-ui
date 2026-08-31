import type { Identity, PolicyView } from './api'
import type { PairRow } from './pools'

/**
 * Settings page (api-v1.md §5.16, spec §5.9) pure logic: governance policy
 * form-state ↔ wire transforms and validation. The PUT is section-replace
 * (a present key replaces that whole section), so every edit merges
 * client-side against the current view before sending.
 */

/** The policy routes are Admin-only; the page gates on this (fail closed). */
export function canEditPolicy(identity: Identity | null): boolean {
  return identity?.roles.includes('admin') ?? false
}

// --- Price sheet -------------------------------------------------------------

/** Known price keys get their unit meaning; unknown keys render raw. */
const PRICE_UNIT_LABELS: Record<string, string> = {
  cpu: '$/core-hour',
  memory: '$/GiB-hour',
  'nvidia.com/gpu': '$/GPU-hour',
}

export function priceUnitLabel(key: string): string {
  return PRICE_UNIT_LABELS[key] ?? '$/unit-hour'
}

/** Wire prices → editor rows (string values while typing). */
export function pricesToRows(prices: Record<string, number> | null): PairRow[] {
  if (prices == null) return []
  return Object.entries(prices).map(([key, value]) => ({
    key,
    value: String(value),
  }))
}

/**
 * Editor rows → wire map, or the first validation error. Empty rows are
 * dropped; amounts must parse to a non-negative finite number — mirroring
 * the backend's 400 (`invalid price for "cpu": must be a non-negative
 * finite number`), which names the key.
 */
export function rowsToAmounts(
  rows: PairRow[],
  what: string,
): Record<string, number> | string {
  const map: Record<string, number> = {}
  for (const row of rows) {
    const key = row.key.trim()
    const raw = row.value.trim()
    if (key === '' && raw === '') continue
    if (key === '') return `${what} row is missing a resource key`
    const value = Number(raw)
    if (raw === '' || !Number.isFinite(value) || value < 0) {
      return `invalid ${what} for ${JSON.stringify(key)}: must be a non-negative finite number`
    }
    map[key] = value
  }
  return map
}

// --- Project quotas ----------------------------------------------------------

/**
 * Replace (or delete, on null/empty) one project's limits inside the FULL
 * quotas map — `PUT {quotas}` replaces the whole section, so a single-
 * project edit/delete is a client-side merge against the current view.
 */
export function withProjectQuota(
  quotas: Record<string, Record<string, number>>,
  project: string,
  resources: Record<string, number> | null,
): Record<string, Record<string, number>> {
  const next = { ...quotas }
  if (resources == null || Object.keys(resources).length === 0) {
    delete next[project]
  } else {
    next[project] = resources
  }
  return next
}

/** Compact amount rendering: `500`, `2.5`, `1,024` (quotas store f64s). */
export function formatAmount(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : String(value)
}

/** One project's limits for the table: `cpu=500, nvidia.com/gpu=8`. */
export function formatQuotaLimits(limits: Record<string, number>): string {
  const entries = Object.entries(limits)
  if (entries.length === 0) return '—'
  return entries.map(([key, value]) => `${key}=${formatAmount(value)}`).join(', ')
}

// --- Provenance --------------------------------------------------------------

/** Badge text for `PolicyView.source`. */
export function sourceBadge(source: PolicyView['source']): string {
  switch (source) {
    case 'file':
      return 'from policy file'
    case 'store':
      return 'saved to store'
    case 'none':
      return 'not configured'
  }
}
