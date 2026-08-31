import { describe, expect, it } from 'vitest'

import type { Identity } from './api'
import type { AuditEvent } from './audit'
import {
  buildAuditQuery,
  canViewAudit,
  decisionBadgeVariant,
  denialDetail,
  emptyAuditFilters,
  formatRelativeTime,
  statusClass,
} from './audit'

const NOW = 1_755_366_400_000 // ms

describe('buildAuditQuery', () => {
  it('returns an empty string when nothing is set', () => {
    const filters = { ...emptyAuditFilters(), windowSeconds: 0 }
    expect(buildAuditQuery(filters)).toBe('')
  })

  it('serializes the time window as inclusive unix from/to', () => {
    const filters = { ...emptyAuditFilters(), windowSeconds: 3_600 }
    expect(buildAuditQuery(filters, { now: NOW })).toBe(
      '?from=1755362800&to=1755366400',
    )
  })

  it('omits unset filters and serializes set ones', () => {
    const filters = {
      ...emptyAuditFilters(),
      windowSeconds: 0,
      subject: 'u1234',
      cluster: 'demo',
      method: 'POST' as const,
      decision: 'deny' as const,
      minStatus: '400' as const,
    }
    expect(buildAuditQuery(filters)).toBe(
      '?subject=u1234&cluster=demo&method=POST&decision=deny&min_status=400',
    )
  })

  it('trims and URL-encodes free-text filters', () => {
    const filters = {
      ...emptyAuditFilters(),
      windowSeconds: 0,
      subject: '  alice@example.com  ',
    }
    expect(buildAuditQuery(filters)).toBe('?subject=alice%40example.com')
  })

  it('treats whitespace-only free text as unset', () => {
    const filters = { ...emptyAuditFilters(), windowSeconds: 0, subject: '   ' }
    expect(buildAuditQuery(filters)).toBe('')
  })

  it('includes limit and cursor for pagination', () => {
    const filters = { ...emptyAuditFilters(), windowSeconds: 0 }
    expect(buildAuditQuery(filters, { limit: 50 })).toBe('?limit=50')
    expect(buildAuditQuery(filters, { limit: 50, cursor: 41 })).toBe(
      '?limit=50&cursor=41',
    )
    // null cursor = first page — omitted, not serialized as "null".
    expect(buildAuditQuery(filters, { limit: 50, cursor: null })).toBe(
      '?limit=50',
    )
  })

  it('appends format=csv for export', () => {
    const filters = { ...emptyAuditFilters(), windowSeconds: 0 }
    expect(buildAuditQuery(filters, { limit: 1000, format: 'csv' })).toBe(
      '?limit=1000&format=csv',
    )
  })
})

describe('decisionBadgeVariant', () => {
  it('maps allow to quiet and deny to loud', () => {
    expect(decisionBadgeVariant('allow')).toBe('success')
    expect(decisionBadgeVariant('deny')).toBe('destructive')
  })
})

describe('statusClass', () => {
  it('colors by status class', () => {
    expect(statusClass(200)).toContain('emerald')
    expect(statusClass(302)).toContain('emerald')
    expect(statusClass(403)).toContain('amber')
    expect(statusClass(500)).toContain('red')
  })
})

describe('formatRelativeTime', () => {
  it('renders relative units', () => {
    const ts = Math.floor(NOW / 1000)
    expect(formatRelativeTime(ts, NOW)).toBe('0s ago')
    expect(formatRelativeTime(ts - 300, NOW)).toBe('5m ago')
    expect(formatRelativeTime(ts - 7_200, NOW)).toBe('2h ago')
    expect(formatRelativeTime(ts - 172_800, NOW)).toBe('2d ago')
  })

  it('clamps future timestamps to zero', () => {
    expect(formatRelativeTime(Math.floor(NOW / 1000) + 60, NOW)).toBe('0s ago')
  })
})

describe('denialDetail', () => {
  const event = (over: Partial<AuditEvent>): AuditEvent => ({
    ts: 1_755_280_000,
    subject: 'u1234',
    decision: 'deny',
    reason: null,
    action: null,
    cluster: null,
    method: null,
    path: null,
    status: 403,
    latency_ms: 4,
    required: null,
    granted_roles: null,
    ...over,
  })

  it('combines reason, required permission, and granted roles', () => {
    expect(
      denialDetail(
        event({
          reason: 'insufficient_permission',
          required: { action: 'write', target: 'cluster' },
          granted_roles: ['viewer'],
        }),
      ),
    ).toBe('insufficient_permission — required write on cluster — granted: viewer')
  })

  it('renders an empty granted list as none and omits absent fields', () => {
    expect(denialDetail(event({ granted_roles: [] }))).toBe('granted: none')
    expect(denialDetail(event({}))).toBe('')
  })
})

describe('canViewAudit', () => {
  const identity = (roles: Identity['roles']): Identity => ({
    subject: 's',
    groups: [],
    roles,
  })

  it('is admin-only and fails closed on null identity', () => {
    expect(canViewAudit(identity(['admin']))).toBe(true)
    expect(canViewAudit(identity(['viewer', 'admin']))).toBe(true)
    expect(canViewAudit(identity(['operator']))).toBe(false)
    expect(canViewAudit(identity(['developer']))).toBe(false)
    expect(canViewAudit(null)).toBe(false)
  })
})
