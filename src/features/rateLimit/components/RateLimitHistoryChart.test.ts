import { describe, expect, it } from 'vitest'
import type { RateLimitSnapshot } from '../rateLimitClient'
import { buildHourlyTrend, buildLiveTrend, LIVE_SAMPLE_INTERVAL_MS } from './RateLimitHistoryChart'

function snapshot(capturedAt: string, used: number): RateLimitSnapshot {
  return {
    captured_at: capturedAt,
    payload: {
      resources: {},
      rate: { limit: 5000, used, remaining: 5000 - used, reset: 0 },
    },
  }
}

describe('buildHourlyTrend', () => {
  it('keeps the latest snapshot per hour and excludes data outside the last 24 hours', () => {
    const now = Date.parse('2026-11-16T15:15:00Z')
    const points = buildHourlyTrend([
      snapshot('2026-11-15T14:30:00Z', 2),
      snapshot('2026-11-16T14:30:00Z', 18),
      snapshot('2026-11-16T15:05:00Z', 20),
      snapshot('2026-11-16T15:10:00Z', 22),
      snapshot('2026-11-16T15:20:00Z', 24),
    ], now)

    expect(points).toHaveLength(24)
    expect(points.at(-2)).toEqual({ timestamp: Date.parse('2026-11-16T14:30:00Z'), used: 18 })
    expect(points.at(-1)).toEqual({ timestamp: Date.parse('2026-11-16T15:10:00Z'), used: 22 })
    expect(points.filter((point) => point.used !== null)).toHaveLength(2)
  })
})

describe('buildLiveTrend', () => {
  it('extends the latest fresh observation to the moving chart edge', () => {
    const now = 100_000
    const points = buildLiveTrend([
      { timestamp: now - 10_000, used: 2 },
      { timestamp: now - LIVE_SAMPLE_INTERVAL_MS, used: 4 },
    ], now, 60_000)

    expect(points).toEqual([
      { timestamp: now - 10_000, used: 2 },
      { timestamp: now - LIVE_SAMPLE_INTERVAL_MS, used: 4 },
      { timestamp: now, used: 4 },
    ])
  })

  it('does not present an old observation as a current reading', () => {
    const now = 100_000
    const points = buildLiveTrend([
      { timestamp: now - LIVE_SAMPLE_INTERVAL_MS * 3, used: 4 },
    ], now, 60_000)

    expect(points).toEqual([{ timestamp: now - LIVE_SAMPLE_INTERVAL_MS * 3, used: 4 }])
  })
})
