/**
 * Engine model (Ray | Dask). A cluster's `engine` decides its whole surface:
 * Ray uses `ray_version` + a RayCluster (head + workers, client :10001 /
 * dashboard :8265) and is the only engine with a Jobs API and Ray Serve
 * services; Dask uses an image + a DaskCluster (scheduler + workers,
 * scheduler :8786 / dashboard :8787) and has neither a job-submission API nor
 * Serve. Kueue pools are engine-neutral. The backend default is Ray, so
 * anything that can't be read as Dask normalizes to Ray.
 */
export type Engine = 'ray' | 'dask'

/** Wire `engine` (any shape) → a renderable Engine. Defaults to Ray. */
export function normalizeEngine(value: unknown): Engine {
  return value === 'dask' ? 'dask' : 'ray'
}

/** Human label for headers/badges/columns. */
export function engineLabel(engine: Engine): string {
  return engine === 'dask' ? 'Dask' : 'Ray'
}

/**
 * The head-role label per engine: Ray schedules through a *head* node, Dask
 * through a *scheduler*. Used to label the first node card correctly.
 */
export function headRoleLabel(engine: Engine): string {
  return engine === 'dask' ? 'Scheduler' : 'Head node'
}

/**
 * Ray exposes a per-cluster Jobs API (proxying Ray's own /api/jobs/); Dask has
 * no equivalent, so the Jobs tab is not-applicable rather than pending/error.
 */
export function engineHasJobsApi(engine: Engine): boolean {
  return engine === 'ray'
}

/**
 * Ray Serve services are deployed as KubeRay RayServices — a Ray-only surface.
 * Dask clusters offer no services.
 */
export function engineHasServices(engine: Engine): boolean {
  return engine === 'ray'
}

/** Sensible default image per engine for the create form. */
export function defaultImageFor(engine: Engine): string {
  return engine === 'dask' ? 'ghcr.io/dask/dask:latest' : 'rayproject/ray:2.57.0'
}
