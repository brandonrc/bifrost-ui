import { useInfiniteQuery } from '@tanstack/react-query'
import { Download, Lock, ScrollText } from 'lucide-react'
import { useState } from 'react'

import { useCanViewAudit } from '@/auth/permissions'
import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import {
  AUDIT_DEFAULT_LIMIT,
  AUDIT_EXPORT_LIMIT,
  AUDIT_WINDOWS,
  buildAuditQuery,
  decisionBadgeVariant,
  denialDetail,
  emptyAuditFilters,
  formatRelativeTime,
  statusClass,
} from '@/lib/audit'
import type { AuditFilters } from '@/lib/audit'
import { cn, downloadTextFile } from '@/lib/utils'

const selectClasses =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/**
 * Audit log viewer (spec §5.7, api-v1.md §5.9). Admin-only — the whole page
 * gates on the held role set, mirroring the endpoint's hard boundary.
 * Newest-first rows with cursor pagination; deny rows (authn/authz/quota
 * refusals) carry required/granted detail as a first-class tooltip.
 */
export function AuditPage() {
  const canView = useCanViewAudit()
  const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters())
  const [applied, setApplied] = useState<AuditFilters>(emptyAuditFilters())
  const [exportError, setExportError] = useState<string | null>(null)

  const query = useInfiniteQuery({
    queryKey: ['audit', applied],
    queryFn: ({ pageParam }) =>
      api.audit(
        buildAuditQuery(applied, {
          cursor: pageParam,
          limit: AUDIT_DEFAULT_LIMIT,
        }),
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    retry: false,
    refetchInterval: 30_000,
    enabled: canView,
  })

  if (!canView) {
    return (
      <>
        <PageHeader
          title="Audit"
          description="Who did what, on which cluster, with what result. (Admin)"
        />
        <EmptyState
          icon={Lock}
          title="Admin role required"
          description="The audit log is Admin-only (api-v1.md §5.9): it records every authenticated request the control plane serves, including authn and authz denials. Developer, Operator, and Viewer identities have no access."
        />
      </>
    )
  }

  const patch = (patch: Partial<AuditFilters>) =>
    setDraft((prev) => ({ ...prev, ...patch }))

  const events = query.data?.pages.flatMap((page) => page.items) ?? []

  const exportJson = () => {
    const lastPage = query.data?.pages.at(-1)
    downloadTextFile(
      'bifrost-audit.json',
      JSON.stringify(
        { items: events, next_cursor: lastPage?.next_cursor ?? null },
        null,
        2,
      ),
      'application/json',
    )
  }

  const exportCsv = async () => {
    setExportError(null)
    try {
      const csv = await api.auditCsv(
        buildAuditQuery(applied, {
          limit: AUDIT_EXPORT_LIMIT,
          format: 'csv',
        }),
      )
      downloadTextFile('bifrost-audit.csv', csv, 'text/csv')
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Audit"
        description="Who did what, on which cluster, with what result. Newest first. (Admin)"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={exportJson}
              disabled={events.length === 0}
            >
              <Download /> JSON
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download /> CSV
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Subject</span>
            <Input
              value={draft.subject}
              onChange={(e) => patch({ subject: e.target.value })}
              placeholder="u1234"
              className="w-40"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Cluster</span>
            <Input
              value={draft.cluster}
              onChange={(e) => patch({ cluster: e.target.value })}
              placeholder="demo"
              className="w-40"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Method</span>
            <select
              value={draft.method}
              onChange={(e) =>
                patch({ method: e.target.value as AuditFilters['method'] })
              }
              className={selectClasses}
            >
              <option value="any">Any</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Decision</span>
            <select
              value={draft.decision}
              onChange={(e) =>
                patch({ decision: e.target.value as AuditFilters['decision'] })
              }
              className={selectClasses}
            >
              <option value="any">Any</option>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">
              Min status
            </span>
            <select
              value={draft.minStatus}
              onChange={(e) =>
                patch({ minStatus: e.target.value as AuditFilters['minStatus'] })
              }
              className={selectClasses}
            >
              <option value="any">Any</option>
              <option value="400">400+</option>
              <option value="500">500+</option>
            </select>
          </label>
          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">
              Time range
            </span>
            <div className="flex gap-1">
              {AUDIT_WINDOWS.map((window) => (
                <Button
                  key={window.seconds}
                  size="sm"
                  variant={
                    window.seconds === draft.windowSeconds
                      ? 'default'
                      : 'outline'
                  }
                  onClick={() => patch({ windowSeconds: window.seconds })}
                >
                  {window.label}
                </Button>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={() => setApplied(draft)}>
            Apply filters
          </Button>
        </CardContent>
      </Card>

      {exportError ? (
        <p className="mb-4 text-sm text-destructive">
          CSV export failed: {exportError}
        </p>
      ) : null}

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit events yet"
          description="Events are recorded when the control plane serves authenticated requests — gateway calls, mutations, and every authn/authz denial. Try a wider time range or fewer filters."
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Cluster</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event, i) => (
                  <TableRow key={`${event.ts}-${i}`}>
                    <TableCell
                      className="whitespace-nowrap text-muted-foreground"
                      title={new Date(event.ts * 1000).toLocaleString()}
                    >
                      {formatRelativeTime(event.ts)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={decisionBadgeVariant(event.decision)}
                        title={
                          event.decision === 'deny'
                            ? denialDetail(event)
                            : undefined
                        }
                      >
                        {event.decision}
                      </Badge>
                      {event.decision === 'deny' && event.reason != null ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {event.reason}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.subject ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.action ?? '—'}
                    </TableCell>
                    <TableCell>{event.cluster ?? '—'}</TableCell>
                    <TableCell className="max-w-md truncate font-mono text-xs">
                      {event.method != null || event.path != null
                        ? `${event.method ?? ''} ${event.path ?? ''}`.trim()
                        : '—'}
                    </TableCell>
                    <TableCell
                      className={cn('font-mono', statusClass(event.status))}
                    >
                      {event.status}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.latency_ms} ms
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            {query.hasNextPage ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {events.length} event{events.length === 1 ? '' : 's'} loaded
            </span>
          </div>
        </>
      )}
    </>
  )
}
