import type { UsageGroup, UsageReport } from './api'

/** Time windows for the usage page (unix seconds, computed from now). */
export const USAGE_WINDOWS = [
  { label: 'Last 1h', seconds: 3_600 },
  { label: 'Last 24h', seconds: 86_400 },
  { label: 'Last 7d', seconds: 604_800 },
] as const

export function usageWindow(seconds: number, now = Date.now()): { from: number; to: number } {
  const to = Math.floor(now / 1000)
  return { from: to - seconds, to }
}

/** Short display name for a resource key (`nvidia.com/gpu` → `GPU`). */
export function resourceDisplayName(key: string): string {
  switch (key) {
    case 'cpu':
      return 'CPU'
    case 'nvidia.com/gpu':
      return 'GPU'
    case 'memory':
      return 'Memory'
    default:
      return key
  }
}

/**
 * Render resource-hours readably: `4.67 CPU-hours`, `0.5 GPU-hours`.
 * Values come from the backend's step-function integration, so fractional
 * hours are the norm.
 */
export function formatResourceHours(key: string, hours: number): string {
  const rounded = Math.round(hours * 100) / 100
  return `${rounded} ${resourceDisplayName(key)}-hours`
}

/** `cost_usd` is null when no price sheet is configured — show `—`. */
export function formatCostUsd(costUsd: number | null | undefined): string {
  if (costUsd == null) return '—'
  return `$${costUsd.toFixed(2)}`
}

/**
 * Sum resource-hours for one resource key across a report's groups.
 *
 * The pool-level aggregate row (`project: ""`, Kueue path only) OVERLAPS
 * the per-project rows (api-v1.md §5.13), so summing everything double
 * counts: prefer per-project rows, and fall back to the aggregate rows
 * only when no per-project rows exist.
 */
export function sumResourceHours(report: UsageReport, key: string): number | undefined {
  const perProject = report.groups.filter((g) => g.project !== '')
  const rows: UsageGroup[] = perProject.length > 0 ? perProject : report.groups
  let total = 0
  let seen = false
  for (const group of rows) {
    const value = group.resourceHours[key]
    if (value != null) {
      total += value
      seen = true
    }
  }
  return seen ? total : undefined
}
