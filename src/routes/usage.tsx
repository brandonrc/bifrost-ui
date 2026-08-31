import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiErrorState, EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
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
import {
  USAGE_WINDOWS,
  formatCostUsd,
  formatResourceHours,
  usageWindow,
} from '@/lib/usage'

/**
 * Consumption reporting (api-v1.md §5.13): resource-hours per (project,
 * pool) over a selectable window. `cost_usd` is null until the backend has
 * a price sheet configured — rendered as "—".
 */
export function UsagePage() {
  const [windowSeconds, setWindowSeconds] = useState<number>(86_400)

  const query = useQuery({
    queryKey: ['usage', windowSeconds],
    queryFn: () => {
      const { from, to } = usageWindow(windowSeconds)
      return api.usage(from, to)
    },
    retry: false,
    refetchInterval: 60_000,
  })

  return (
    <>
      <PageHeader
        title="Usage"
        description="Metered resource-hours per project and pool — history survives clusters because the control plane meters them."
        actions={
          <div className="flex gap-1">
            {USAGE_WINDOWS.map((window) => (
              <Button
                key={window.seconds}
                size="sm"
                variant={window.seconds === windowSeconds ? 'default' : 'outline'}
                onClick={() => setWindowSeconds(window.seconds)}
              >
                {window.label}
              </Button>
            ))}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Resource-hours by project and pool</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : query.isError ? (
            <ApiErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : query.data.groups.length === 0 ? (
            <EmptyState
              title="No usage in this window"
              description="The metering loop records samples once pools and clusters are running — try a wider window."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Pool</TableHead>
                    <TableHead>Resource-hours</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.groups.map((group) => (
                    <TableRow
                      key={`${group.project}/${group.pool}`}
                      className={cn(group.project === '' && 'text-muted-foreground')}
                    >
                      <TableCell className="font-medium">
                        {group.project === '' ? '(pool total)' : group.project}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {group.pool === '' ? '—' : group.pool}
                      </TableCell>
                      <TableCell>
                        {Object.entries(group.resourceHours)
                          .map(([key, hours]) => formatResourceHours(key, hours))
                          .join(' · ')}
                      </TableCell>
                      <TableCell
                        className={cn(group.costUsd == null && 'text-muted-foreground')}
                        title={
                          group.costUsd == null
                            ? 'No price sheet configured on the backend'
                            : undefined
                        }
                      >
                        {formatCostUsd(group.costUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                “—” cost means no price sheet is configured on the control
                plane. “(pool total)” rows overlap the per-project rows —
                don't sum across them.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
