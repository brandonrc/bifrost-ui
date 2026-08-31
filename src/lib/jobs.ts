import type { JobView } from './api'

/**
 * Job-history helpers for the Overview stat tiles (spec §5.1). Pure and
 * status-string driven so the tiles come alive the moment
 * `GET /api/v1/jobs` starts returning gateway-submitted jobs (#89) — no
 * hardcoded values. Ray statuses: PENDING | RUNNING | SUCCEEDED | FAILED |
 * STOPPED (comparison is case-insensitive to match the wire verbatim).
 */

/** In-flight jobs — not yet terminal. */
export function isActiveJob(status: string): boolean {
  const s = status.toUpperCase()
  return s === 'RUNNING' || s === 'PENDING'
}

/** Count of jobs still in flight (PENDING or RUNNING). */
export function countActiveJobs(jobs: JobView[]): number {
  return jobs.filter((job) => isActiveJob(job.status)).length
}

/**
 * Count of jobs that FAILED with a submission timestamp at or after
 * `sinceUnixSecs`. `submittedAt` (unix seconds) is the only time the wire
 * carries, so it stands in for "failed in the window".
 */
export function countFailedJobsSince(
  jobs: JobView[],
  sinceUnixSecs: number,
): number {
  return jobs.filter(
    (job) =>
      job.status.toUpperCase() === 'FAILED' && job.submittedAt >= sinceUnixSecs,
  ).length
}

/**
 * Most-recently-submitted jobs first, capped at `limit`, for the Overview
 * "Recent activity" list. Does not mutate the input.
 */
export function recentJobs(jobs: JobView[], limit: number): JobView[] {
  return [...jobs]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, limit)
}
