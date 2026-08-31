import type { VersionInfo } from './api'

export type HealthTone = 'green' | 'amber' | 'red'

export interface ControlPlaneHealth {
  tone: HealthTone
  label: string
  version?: string
}

/**
 * Reduce the two control-plane probes (`/healthz` + `/api/v1/version`) into a
 * single indicator state for the top bar (spec §4):
 * - red   — /healthz failed (control plane down or unreachable)
 * - amber — /healthz ok but the version endpoint failed (degraded)
 * - green — both ok
 */
export function reduceControlPlaneHealth(input: {
  healthzOk: boolean
  versionOk: boolean
  version?: VersionInfo
}): ControlPlaneHealth {
  const { healthzOk, versionOk, version } = input

  if (!healthzOk) {
    return { tone: 'red', label: 'Control plane unreachable' }
  }
  if (!versionOk || !version) {
    return {
      tone: 'amber',
      label: 'Control plane degraded: /healthz ok, version endpoint failed',
    }
  }
  return {
    tone: 'green',
    label: `Connected to ${version.name} ${version.version}`,
    version: version.version,
  }
}
