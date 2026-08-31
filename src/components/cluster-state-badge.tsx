import { Badge } from '@/components/ui/badge'
import { clusterStatePresentation } from '@/lib/cluster-state'
import type { ClusterState, ClusterStateTone } from '@/lib/cluster-state'
import { cn } from '@/lib/utils'

const TONE_CLASSES: Record<ClusterStateTone, string> = {
  success:
    'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  warning:
    'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400',
  active: 'border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400',
  neutral: 'border-transparent bg-muted text-muted-foreground',
  outline: 'border-border text-muted-foreground',
  muted: 'border-transparent bg-muted/50 text-muted-foreground/70',
}

const DOT_CLASSES: Record<ClusterStateTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  active: 'bg-blue-500',
  neutral: 'bg-zinc-400',
  outline: 'bg-zinc-400',
  muted: 'bg-zinc-400/60',
}

/**
 * The one badge for `ClusterState` (spec §6) — reused on every screen that
 * shows a cluster. Colors and tooltips come from `lib/cluster-state.ts` so
 * the mapping is defined exactly once.
 */
export function ClusterStateBadge({
  state,
  className,
}: {
  state: ClusterState
  className?: string
}) {
  const { label, tone, animated, tooltip } = clusterStatePresentation(state)
  return (
    <Badge
      variant="outline"
      title={tooltip}
      className={cn(TONE_CLASSES[tone], className)}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          DOT_CLASSES[tone],
          animated && 'animate-pulse',
        )}
      />
      {label}
    </Badge>
  )
}
