import { describe, expect, it } from 'vitest'

import type { JobView } from './api'
import {
  countActiveJobs,
  countFailedJobsSince,
  isActiveJob,
  recentJobs,
} from './jobs'

function job(overrides: Partial<JobView> = {}): JobView {
  return {
    id: 'job-1',
    cluster: 'ray-live',
    submitter: 'bob',
    status: 'RUNNING',
    durationSecs: null,
    submittedAt: 1_000,
    ...overrides,
  }
}

describe('isActiveJob', () => {
  it('treats RUNNING and PENDING as in-flight, case-insensitively', () => {
    expect(isActiveJob('RUNNING')).toBe(true)
    expect(isActiveJob('pending')).toBe(true)
    expect(isActiveJob('SUCCEEDED')).toBe(false)
    expect(isActiveJob('FAILED')).toBe(false)
    expect(isActiveJob('STOPPED')).toBe(false)
  })
})

describe('countActiveJobs', () => {
  it('counts only in-flight jobs', () => {
    const jobs = [
      job({ status: 'RUNNING' }),
      job({ status: 'PENDING' }),
      job({ status: 'SUCCEEDED' }),
      job({ status: 'FAILED' }),
    ]
    expect(countActiveJobs(jobs)).toBe(2)
    expect(countActiveJobs([])).toBe(0)
  })
})

describe('countFailedJobsSince', () => {
  it('counts FAILED jobs submitted at or after the cutoff', () => {
    const jobs = [
      job({ status: 'FAILED', submittedAt: 500 }), // before cutoff
      job({ status: 'FAILED', submittedAt: 1_000 }), // at cutoff
      job({ status: 'FAILED', submittedAt: 2_000 }), // after cutoff
      job({ status: 'SUCCEEDED', submittedAt: 2_000 }), // not failed
    ]
    expect(countFailedJobsSince(jobs, 1_000)).toBe(2)
  })
})

describe('recentJobs', () => {
  it('returns newest first, capped, without mutating the input', () => {
    const jobs = [
      job({ id: 'a', submittedAt: 1 }),
      job({ id: 'c', submittedAt: 3 }),
      job({ id: 'b', submittedAt: 2 }),
    ]
    const result = recentJobs(jobs, 2)
    expect(result.map((j) => j.id)).toEqual(['c', 'b'])
    // input order preserved
    expect(jobs.map((j) => j.id)).toEqual(['a', 'c', 'b'])
  })
})
