import { Badge } from '@/components/ui/badge'
import { engineLabel, type Engine } from '@/lib/engine'

/**
 * Ray vs Dask at a glance. Ray is sky, Dask is amber; the title spells out
 * the topology each engine implies (head+workers vs scheduler+workers).
 */
export function EngineBadge({
  engine,
  className,
}: {
  engine: Engine
  className?: string
}) {
  const dask = engine === 'dask'
  return (
    <Badge
      variant="outline"
      className={
        (dask
          ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
          : 'border-sky-500/50 text-sky-600 dark:text-sky-400') +
        (className ? ` ${className}` : '')
      }
      title={
        dask
          ? 'Dask cluster — scheduler + workers (no Jobs API, no Serve services)'
          : 'Ray cluster — head + workers (Jobs API and Serve services available)'
      }
    >
      {engineLabel(engine)}
    </Badge>
  )
}
