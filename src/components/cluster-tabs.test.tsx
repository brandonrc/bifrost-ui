import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  ClusterTabError,
  DaskJobsNotApplicable,
  EventsSection,
  JobsSection,
  LogsSection,
  MetricsSection,
  NodesSection,
  formatCpuCores,
  formatGpu,
  formatJobDuration,
  formatJobStart,
  formatMemoryGiB,
  formatRelativeAge,
} from '@/components/cluster-tabs'
import { EngineBadge } from '@/components/engine-badge'
import { BifrostApiError } from '@/lib/api'
import type {
  ClusterEventsView,
  ClusterJobView,
  ClusterLogsView,
  ClusterMetricsView,
  ClusterNodesView,
} from '@/lib/api'

describe('formatters', () => {
  it('formats memory bytes as GiB', () => {
    expect(formatMemoryGiB(2 * 1024 ** 3)).toBe('2.0 GiB')
    expect(formatMemoryGiB(null)).toBe('—')
    expect(formatMemoryGiB(undefined)).toBe('—')
  })

  it('formats cpu as cores with singular/plural', () => {
    expect(formatCpuCores(1)).toBe('1 core')
    expect(formatCpuCores(8)).toBe('8 cores')
    expect(formatCpuCores(0.5)).toBe('0.5 cores')
    expect(formatCpuCores(null)).toBe('—')
  })

  it('formats gpu count', () => {
    expect(formatGpu(2)).toBe('2')
    expect(formatGpu(null)).toBe('—')
  })

  it('formats job start and duration from epoch ms', () => {
    expect(formatJobStart(null)).toBe('—')
    expect(formatJobDuration(1000, 6000)).toBe('5s')
    expect(formatJobDuration(0, 90_000)).toBe('1m 30s')
    // still running (no end): dash, not a crash
    expect(formatJobDuration(1000, null)).toBe('—')
  })
})

const nodesData: ClusterNodesView = {
  cluster_id: 'team-b-scoring',
  head: {
    pod_name: 'raycluster-head-abc',
    is_head: true,
    phase: 'Running',
    ready: true,
    node_ip: '10.0.0.1',
    host: 'ip-10-0-0-1',
    cpu: 8,
    memory_bytes: 34_359_738_368,
    gpu: 0,
  },
  worker_groups: [
    {
      name: 'gpu-workers',
      desired: 2,
      ready: 1,
      nodes: [
        {
          pod_name: 'raycluster-worker-xyz',
          group: 'gpu-workers',
          is_head: false,
          phase: 'Running',
          ready: true,
          node_ip: '10.0.0.2',
          host: 'ip-10-0-0-2',
          cpu: 4,
          memory_bytes: 17_179_869_184,
          gpu: 1,
        },
      ],
    },
  ],
}

describe('NodesSection', () => {
  it('renders the head pod and each worker group with its nodes', () => {
    const html = renderToStaticMarkup(<NodesSection data={nodesData} />)
    expect(html).toContain('raycluster-head-abc')
    expect(html).toContain('gpu-workers')
    expect(html).toContain('raycluster-worker-xyz')
    expect(html).toContain('1/2 ready')
    // memory formatted to GiB, cpu to cores
    expect(html).toContain('GiB')
    expect(html).toContain('cores')
  })

  it('renders a placeholder when there is no head node', () => {
    const html = renderToStaticMarkup(
      <NodesSection data={{ ...nodesData, head: null }} />,
    )
    expect(html).toContain('No head node')
  })

  it('labels the head as the scheduler for a Dask cluster', () => {
    const html = renderToStaticMarkup(
      <NodesSection data={nodesData} engine="dask" />,
    )
    expect(html).toContain('Scheduler')
    expect(html).not.toContain('Head node')
  })
})

describe('DaskJobsNotApplicable', () => {
  it('renders the not-applicable state (not pending, not error)', () => {
    const html = renderToStaticMarkup(<DaskJobsNotApplicable />)
    expect(html).toContain('Not applicable — Dask has no job-submission API')
    expect(html).not.toContain('pending backend')
  })
})

describe('EngineBadge', () => {
  it('labels Ray and Dask distinctly', () => {
    expect(renderToStaticMarkup(<EngineBadge engine="ray" />)).toContain('Ray')
    expect(renderToStaticMarkup(<EngineBadge engine="dask" />)).toContain('Dask')
  })
})

describe('JobsSection', () => {
  it('renders a row per job', () => {
    const jobs: ClusterJobView[] = [
      {
        job_id: 'raysubmit_123',
        status: 'RUNNING',
        entrypoint: 'python train.py --epochs 10',
        start_time: 1_700_000_000_000,
        end_time: null,
      },
      {
        submission_id: 'sub_456',
        status: 'SUCCEEDED',
        entrypoint: 'python eval.py',
        start_time: 1_700_000_000_000,
        end_time: 1_700_000_060_000,
      },
    ]
    const html = renderToStaticMarkup(<JobsSection jobs={jobs} />)
    expect(html).toContain('raysubmit_123')
    expect(html).toContain('sub_456')
    expect(html).toContain('RUNNING')
    expect(html).toContain('SUCCEEDED')
    // entrypoint carries a title for the truncated cell
    expect(html).toContain('title="python train.py --epochs 10"')
  })

  it('renders the empty state when there are no jobs', () => {
    const html = renderToStaticMarkup(<JobsSection jobs={[]} />)
    expect(html).toContain('No jobs on this cluster yet.')
  })
})

describe('ClusterTabError', () => {
  it('renders a clean cluster-unreachable message on a 503', () => {
    const html = renderToStaticMarkup(
      <ClusterTabError
        error={
          new BifrostApiError({
            kind: 'http',
            status: 503,
            message: 'bad gateway to cluster',
          })
        }
      />,
    )
    expect(html).toContain('Cluster unreachable')
    expect(html).toContain('503')
  })
})

describe('formatRelativeAge', () => {
  it('formats a recent timestamp as a compact age', () => {
    const now = Date.now()
    expect(formatRelativeAge(new Date(now - 30_000).toISOString())).toMatch(/s$/)
    expect(formatRelativeAge(new Date(now - 5 * 60_000).toISOString())).toBe('5m')
    expect(formatRelativeAge(new Date(now - 3 * 3600_000).toISOString())).toBe('3h')
    expect(formatRelativeAge(null)).toBe('—')
    expect(formatRelativeAge('not-a-date')).toBe('—')
  })
})

describe('EventsSection', () => {
  const events: ClusterEventsView = {
    cluster_id: 'team-b-scoring',
    events: [
      {
        type: 'Warning',
        reason: 'FailedScheduling',
        message: '0/3 nodes available: 3 Insufficient nvidia.com/gpu',
        count: 4,
        first_seen: new Date(Date.now() - 600_000).toISOString(),
        last_seen: new Date(Date.now() - 300_000).toISOString(),
        object: 'Pod/team-b-scoring-head-abc',
      },
    ],
  }

  it('renders a row per event with type, reason, message and count', () => {
    const html = renderToStaticMarkup(<EventsSection data={events} />)
    expect(html).toContain('Warning')
    expect(html).toContain('FailedScheduling')
    expect(html).toContain('Insufficient nvidia.com/gpu')
    expect(html).toContain('Pod/team-b-scoring-head-abc')
    expect(html).toContain('>4<')
  })

  it('renders the empty state when there are no events', () => {
    const html = renderToStaticMarkup(
      <EventsSection data={{ cluster_id: 'c', events: [] }} />,
    )
    expect(html).toContain('No events for this cluster.')
  })
})

describe('MetricsSection', () => {
  it('renders a tile per reported resource and node counts', () => {
    const metrics: ClusterMetricsView = {
      cluster_id: 'c',
      cpu: { used: 6, total: 8 },
      gpu: { used: 1, total: 2 },
      memory: { used: 10 * 1024 ** 3, total: 32 * 1024 ** 3 },
      active_nodes: 3,
      pending_nodes: 0,
    }
    const html = renderToStaticMarkup(<MetricsSection data={metrics} />)
    expect(html).toContain('CPU')
    expect(html).toContain('GPU')
    expect(html).toContain('Memory')
    // memory formatted to GiB
    expect(html).toContain('32.0')
    // node counts surfaced
    expect(html).toContain('Active nodes: 3')
    expect(html).toContain('Pending: 0')
  })

  it('omits tiles for resources the cluster does not report', () => {
    const html = renderToStaticMarkup(
      <MetricsSection data={{ cluster_id: 'c', cpu: { used: 1, total: 4 } }} />,
    )
    expect(html).toContain('CPU')
    expect(html).not.toContain('GPU')
  })

  it('renders the empty state when nothing is reported', () => {
    const html = renderToStaticMarkup(<MetricsSection data={{ cluster_id: 'c' }} />)
    expect(html).toContain('No resource metrics reported.')
  })

  it('renders capacity-only tiles when used is absent (non-autoscaling)', () => {
    const html = renderToStaticMarkup(
      <MetricsSection
        data={{
          cluster_id: 'c',
          cpu: { total: 4 },
          memory: { total: 16 * 1024 ** 3 },
          active_nodes: 2,
        }}
      />,
    )
    expect(html).toContain('CPU')
    expect(html).toContain('capacity')
    // no meter/percentage when used is unknown
    expect(html).not.toContain('% used')
    expect(html).toContain('Active nodes: 2')
  })
})

describe('LogsSection', () => {
  const logs: ClusterLogsView = {
    cluster_id: 'c',
    pods: ['c-head-abc', 'c-worker-1'],
    pod: 'c-head-abc',
    tail: 200,
    lines: ['line one', 'line two'],
    truncated: true,
  }

  it('renders the tail, a pod selector, and the streaming-coming-soon note', () => {
    const html = renderToStaticMarkup(
      <LogsSection
        data={logs}
        selectedPod="c-head-abc"
        onSelectPod={() => {}}
        onRefresh={() => {}}
      />,
    )
    expect(html).toContain('line one')
    expect(html).toContain('line two')
    expect(html).toContain('c-worker-1') // selector option
    expect(html).toContain('streaming coming soon')
    expect(html).toContain('showing the last 200 lines')
  })

  it('renders an empty state when the cluster has no pods', () => {
    const html = renderToStaticMarkup(
      <LogsSection
        data={{ ...logs, pods: [], pod: '', lines: [] }}
        selectedPod=""
        onSelectPod={() => {}}
        onRefresh={() => {}}
      />,
    )
    expect(html).toContain('No pods to tail yet.')
  })
})
