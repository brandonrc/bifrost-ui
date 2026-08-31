import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { reduceControlPlaneHealth } from '@/lib/health'
import type { ControlPlaneHealth, HealthTone } from '@/lib/health'
import { cn } from '@/lib/utils'

const DOT_CLASSES: Record<HealthTone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

const CHECKING: ControlPlaneHealth = {
  tone: 'amber',
  label: 'Checking control plane…',
}

/**
 * Top-bar control-plane health indicator (spec §4). Polls `/healthz` and
 * `/api/v1/version` every 30s and folds them into green/amber/red via
 * `reduceControlPlaneHealth`.
 */
export function HealthIndicator() {
  const { data } = useQuery({
    queryKey: ['control-plane-health'],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ControlPlaneHealth> => {
      const [healthz, version] = await Promise.allSettled([
        api.healthz(),
        api.version(),
      ])
      return reduceControlPlaneHealth({
        healthzOk: healthz.status === 'fulfilled',
        versionOk: version.status === 'fulfilled',
        version: version.status === 'fulfilled' ? version.value : undefined,
      })
    },
  })

  const health = data ?? CHECKING

  return (
    <div
      className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs text-muted-foreground"
      title={health.label}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          DOT_CLASSES[health.tone],
          health.tone !== 'green' && 'animate-pulse',
        )}
      />
      <span>control plane</span>
      {health.version ? (
        <span className="font-mono text-foreground">v{health.version}</span>
      ) : null}
    </div>
  )
}
