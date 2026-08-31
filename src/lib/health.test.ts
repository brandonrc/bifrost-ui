import { describe, expect, it } from 'vitest'

import { reduceControlPlaneHealth } from './health'

const version = { name: 'mobula', version: '0.0.1' }

describe('reduceControlPlaneHealth', () => {
  it('is green when both probes succeed, carrying the version', () => {
    const health = reduceControlPlaneHealth({
      healthzOk: true,
      versionOk: true,
      version,
    })
    expect(health.tone).toBe('green')
    expect(health.version).toBe('0.0.1')
    expect(health.label).toContain('mobula')
  })

  it('is amber when /healthz is ok but the version endpoint fails', () => {
    expect(
      reduceControlPlaneHealth({ healthzOk: true, versionOk: false }).tone,
    ).toBe('amber')
  })

  it('is red when /healthz fails, regardless of the version probe', () => {
    expect(
      reduceControlPlaneHealth({
        healthzOk: false,
        versionOk: true,
        version,
      }).tone,
    ).toBe('red')
    expect(
      reduceControlPlaneHealth({ healthzOk: false, versionOk: false }).tone,
    ).toBe('red')
  })
})
