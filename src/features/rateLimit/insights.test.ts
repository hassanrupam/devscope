import { describe, expect, it } from 'vitest'
import {
  buildAlerts, burnRate, filterRows, forecast, formatDuration, healthOf, resourceRows, toCsv, usageGrid,
} from './insights'
import type { RateLimitData, RateLimitSnapshot } from './rateLimitClient'

const res = (used: number, limit = 5000, reset = 0) => ({ limit, used, remaining: limit - used, reset })
const data = (resources: Record<string, ReturnType<typeof res>>, rate = res(100)): RateLimitData => ({ resources, rate })

describe('healthOf', () => {
  it('classifies by percent used', () => {
    expect(healthOf(res(0))).toBe('idle')
    expect(healthOf(res(100))).toBe('healthy')
    expect(healthOf(res(3000))).toBe('elevated') // 60%
    expect(healthOf(res(4250))).toBe('critical') // 85%
  })
  it('does not divide by a zero limit', () => expect(healthOf(res(5, 0))).toBe('healthy'))
})

describe('burnRate', () => {
  const now = 10 * 60_000
  it('is requests per minute over the window', () => {
    expect(burnRate([{ timestamp: now - 120_000, used: 10 }, { timestamp: now, used: 30 }], now)).toBeCloseTo(10)
  })
  it('ignores samples from before a quota reset', () => {
    const rate = burnRate([
      { timestamp: now - 240_000, used: 4900 },
      { timestamp: now - 120_000, used: 5 }, // reset happened here
      { timestamp: now, used: 25 },
    ], now)
    expect(rate).toBeCloseTo(10)
  })
  it('needs at least two samples spread over a few seconds', () => {
    expect(burnRate([], now)).toBeNull()
    expect(burnRate([{ timestamp: now, used: 5 }], now)).toBeNull()
    expect(burnRate([{ timestamp: now - 2000, used: 5 }, { timestamp: now, used: 9 }], now)).toBeNull()
  })
  it('is never negative and ignores old samples', () => {
    expect(burnRate([{ timestamp: now - 20 * 60_000, used: 1 }, { timestamp: now - 10 * 60_000, used: 9 }], now)).toBeNull()
  })
})

describe('forecast', () => {
  const now = 1_000_000
  it('projects usage at reset and detects exhaustion before it', () => {
    const resource = res(4000, 5000, (now + 30 * 60_000) / 1000) // 30 min left, 1000 remaining
    const calm = forecast(resource, 10, now)
    expect(calm?.projectedAtReset).toBe(4300)
    expect(calm?.exhaustsInMs).toBeNull()
    const hot = forecast(resource, 100, now)
    expect(hot?.exhaustsInMs).toBeCloseTo(10 * 60_000)
  })
  it('has nothing to forecast without a reset time', () => expect(forecast(res(1), 5, 0)).toBeNull())
})

describe('formatDuration', () => {
  it('uses the two most useful units', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(5 * 60_000 + 3000)).toBe('5m 3s')
    expect(formatDuration(2 * 3600_000 + 5 * 60_000)).toBe('2h 5m')
  })
})

describe('buildAlerts', () => {
  const now = 1_000_000
  it('reports healthy when nothing is wrong', () => {
    expect(buildAlerts(data({ core: res(10) }), 1, now).map((a) => a.id)).toEqual(['all-good'])
  })
  it('puts critical alerts first and flags forecast exhaustion', () => {
    const reset = (now + 30 * 60_000) / 1000
    const alerts = buildAlerts(data({ core: res(4000, 5000, reset), search: res(28, 30), graphql: res(3200) }, res(4000, 5000, reset)), 100, now)
    expect(alerts[0]?.level).toBe('critical')
    expect(alerts.map((a) => a.id)).toContain('core-exhaust')
    expect(alerts.map((a) => a.id)).toContain('search-critical')
    expect(alerts.map((a) => a.id)).toContain('graphql-elevated')
    expect(alerts.map((a) => a.level)).toEqual([...alerts.map((a) => a.level)].sort((x, y) => ({ critical: 0, warning: 1, info: 2 })[x] - ({ critical: 0, warning: 1, info: 2 })[y]))
  })
})

describe('resource rows', () => {
  const d = data({ core: res(10), search: res(20, 30), graphql: res(0), integration_manifest: res(5, 5000) })
  it('filters, hides idle and sorts', () => {
    const rows = resourceRows(d)
    expect(filterRows(rows, { query: '', hideIdle: false, sort: 'usage' })[0]?.name).toBe('search')
    expect(filterRows(rows, { query: '', hideIdle: true, sort: 'name' }).map((r) => r.name)).toEqual(['core', 'integration_manifest', 'search'])
    expect(filterRows(rows, { query: 'manifest', hideIdle: false, sort: 'name' }).map((r) => r.name)).toEqual(['integration_manifest'])
  })
})

describe('toCsv', () => {
  it('exports every resource with a header, sorted by name', () => {
    const lines = toCsv(data({ search: res(20, 30, 1_700_000_000), core: res(10) })).split('\n')
    expect(lines[0]).toBe('resource,limit,used,remaining,percent_used,health,resets_at')
    expect(lines[1]).toBe('core,5000,10,4990,0.20,healthy,')
    expect(lines[2]).toBe('search,30,20,10,66.67,elevated,2023-11-14T22:13:20.000Z')
  })
})

const snap = (at: string, used: number): RateLimitSnapshot => ({ captured_at: at, payload: { resources: {}, rate: res(used) } })

describe('usageGrid', () => {
  const now = Date.parse('2026-11-16T15:30:00Z')
  it('builds days × 24 hours and keeps the peak per hour', () => {
    const { cells, cols } = usageGrid([snap('2026-11-16T14:10:00Z', 5), snap('2026-11-16T14:40:00Z', 9), snap('2026-11-15T03:00:00Z', 2)], now, 10)
    expect(cols).toBe(10)
    expect(cells).toHaveLength(240)
    const today14 = cells.find((c) => c.col === 9 && c.row === 14)
    expect(today14?.value).toBe(9)
    expect(cells.find((c) => c.col === 8 && c.row === 3)?.value).toBe(2)
    expect(cells.filter((c) => c.value !== null)).toHaveLength(2)
  })
  it('ignores snapshots outside the window and respects the timezone shift', () => {
    expect(usageGrid([snap('2026-10-01T00:00:00Z', 5)], now, 10).cells.every((c) => c.value === null)).toBe(true)
    const shifted = usageGrid([snap('2026-11-16T14:10:00Z', 5)], now, 10, 360) // UTC+6
    expect(shifted.cells.find((c) => c.value === 5)?.row).toBe(20) // 14:10 UTC = 20:10 local
  })
})
