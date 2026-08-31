import { useQuery } from '@tanstack/react-query'

import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Ray job status → badge classes (Nebari-tinted semantic colors). */
function statusClasses(status: string): string {
  switch (status.toUpperCase()) {
    case 'SUCCEEDED':
      return 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    case 'RUNNING':
      return 'border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400'
    case 'FAILED':
      return 'border-transparent bg-red-500/15 text-red-600 dark:text-red-400'
    case 'PENDING':
      return 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400'
    default: // STOPPED and anything else
      return 'border-transparent bg-muted text-muted-foreground'
  }
}

function fmtDuration(secs: number | null | undefined): string {
  if (secs == null) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function fmtWhen(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString()
}

/**
 * Global job history (spec §5.5). The persistent, cross-cluster table is
 * backed by `GET /api/v1/jobs` (Phase 3 Postgres); records outlive the
 * clusters that ran them. Submission stays CLI-first (D4).
 */
export function JobsPage() {
  const query = useQuery({
    queryKey: ['jobs'],
    queryFn: api.jobs,
    retry: false,
    refetchInterval: 15_000,
  })

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Cross-cluster, persistent job history — the direct answer to “Ray dashboards forget everything.”"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Job history</CardTitle>
          </CardHeader>
          <CardContent>
            {query.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : query.isError ? (
              <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
            ) : query.data.length === 0 ? (
              <EmptyState
                title="No jobs yet"
                description="Submit a job through Bifrost's gateway (see the panel on the right) and it will appear here — and stay here after its cluster is gone."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Cluster</TableHead>
                    <TableHead>Submitter</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">{job.id}</TableCell>
                      <TableCell>{job.cluster}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {job.submitter}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('font-medium', statusClasses(job.status))}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmtDuration(job.durationSecs)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtWhen(job.submittedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submitting jobs — CLI-first (D4)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              There is deliberately no submit form in v1. Submit through the
              Ray Jobs CLI against Bifrost's gateway; the command helper on
              this page will generate the exact command plus auth headers once
              clusters are registered.
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`ray job submit \\
  --address http://<cluster-host>:8484 \\
  --working-dir . -- python train.py

# Your JWT travels via:
export RAY_JOB_HEADERS='{"Authorization": "Bearer '"$(mobula token)"'"}'`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
