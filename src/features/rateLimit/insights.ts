import type { RateLimitData, RateLimitResource, RateLimitSnapshot } from './rateLimitClient'

/* ------------------------------------------------------------------------------------------------
 * Pure analytics for the GitHub API dashboard: health levels, burn rate, exhaustion forecast,
 * alerts, CSV export and the hour × day usage grid. No React, no network.
 * ---------------------------------------------------------------------------------------------- */

export type Health = 'idle' | 'healthy' | 'elevated' | 'critical'

export const HEALTH_META: Record<Health, { label: string; color: string }> = {
  idle: { label: 'Idle', color: '#64748b' },
  healthy: { label: 'Healthy', color: '#34d399' },
  elevated: { label: 'Elevated', color: '#fbbf24' },
  critical: { label: 'Critical', color: '#f87171' },
}

export const ELEVATED_AT = 60
export const CRITICAL_AT = 85

export function percentUsed(resource: Pick<RateLimitResource, 'used' | 'limit'>): number {
  return resource.limit > 0 ? Math.min(100, (resource.used / resource.limit) * 100) : 0
}

export function healthOf(resource: Pick<RateLimitResource, 'used' | 'limit'>): Health {
  if (resource.used === 0) return 'idle'
  const percent = percentUsed(resource)
  if (percent >= CRITICAL_AT) return 'critical'
  if (percent >= ELEVATED_AT) return 'elevated'
  return 'healthy'
}

export function resourceLabel(name: string): string {
  return name === 'scim' ? 'SCIM' : name.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/* ---------- Burn rate & forecast ---------- */

export interface UsageSample {
  timestamp: number
  used: number
}

/**
 * Requests per minute over the recent window. The quota counter resets to a lower number every hour,
 * so only the part of the window after the last reset (the last non-decreasing run) is used.
 * Returns null when there is not enough data for a meaningful rate.
 */
export function burnRate(samples: UsageSample[], now: number, windowMs = 5 * 60_000): number | null {
  const recent = samples.filter((s) => s.timestamp >= now - windowMs && s.timestamp <= now)
  let start = 0
  recent.forEach((sample, i) => {
    if (i > 0 && sample.used < (recent[i - 1]?.used ?? 0)) start = i
  })
  const run = recent.slice(start)
  const first = run[0]
  const last = run[run.length - 1]
  if (!first || !last || run.length < 2) return null
  const minutes = (last.timestamp - first.timestamp) / 60_000
  if (minutes < 10 / 60) return null
  return Math.max(0, (last.used - first.used) / minutes)
}

export interface Forecast {
  /** Expected `used` when the window resets, at the current burn rate. */
  projectedAtReset: number
  /** Milliseconds until the quota runs out, or null if it will not run out before the reset. */
  exhaustsInMs: number | null
  msUntilReset: number
}

export function forecast(resource: RateLimitResource, ratePerMinute: number, now: number): Forecast | null {
  if (resource.reset <= 0) return null
  const msUntilReset = Math.max(0, resource.reset * 1000 - now)
  const projectedAtReset = Math.round(resource.used + ratePerMinute * (msUntilReset / 60_000))
  let exhaustsInMs: number | null = null
  if (ratePerMinute > 0) {
    const ms = (resource.remaining / ratePerMinute) * 60_000
    if (ms < msUntilReset) exhaustsInMs = ms
  }
  return { projectedAtReset, exhaustsInMs, msUntilReset }
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/* ---------- Alerts ---------- */

export interface Alert {
  id: string
  level: 'critical' | 'warning' | 'info'
  title: string
  detail: string
}

export function buildAlerts(data: RateLimitData, ratePerMinute: number | null, now: number): Alert[] {
  const alerts: Alert[] = []

  const core = forecast(data.rate, ratePerMinute ?? 0, now)
  if (core?.exhaustsInMs !== null && core?.exhaustsInMs !== undefined) {
    alerts.push({
      id: 'core-exhaust',
      level: 'critical',
      title: 'Core quota will run out before it resets',
      detail: `At ${(ratePerMinute ?? 0).toFixed(1)} requests/min it is exhausted in about ${formatDuration(core.exhaustsInMs)}, ${formatDuration(core.msUntilReset - core.exhaustsInMs)} before the reset.`,
    })
  }

  for (const [name, resource] of Object.entries(data.resources)) {
    const health = healthOf(resource)
    if (health === 'critical') {
      alerts.push({ id: `${name}-critical`, level: 'critical', title: `${resourceLabel(name)} is almost exhausted`, detail: `${percentUsed(resource).toFixed(0)}% used — ${resource.remaining.toLocaleString('en')} requests left.` })
    } else if (health === 'elevated') {
      alerts.push({ id: `${name}-elevated`, level: 'warning', title: `${resourceLabel(name)} usage is elevated`, detail: `${percentUsed(resource).toFixed(0)}% of the quota is used.` })
    }
  }

  if (alerts.length === 0) {
    alerts.push({ id: 'all-good', level: 'info', title: 'All quotas are healthy', detail: 'No resource is close to its limit and nothing is forecast to run out.' })
  }
  const order = { critical: 0, warning: 1, info: 2 } as const
  return alerts.sort((a, b) => order[a.level] - order[b.level])
}

/* ---------- Resource table helpers ---------- */

export interface ResourceRow {
  name: string
  label: string
  resource: RateLimitResource
  percent: number
  health: Health
}

export function resourceRows(data: RateLimitData): ResourceRow[] {
  return Object.entries(data.resources).map(([name, resource]) => ({
    name,
    label: resourceLabel(name),
    resource,
    percent: percentUsed(resource),
    health: healthOf(resource),
  }))
}

export type ResourceSort = 'usage' | 'name'

export function filterRows(rows: ResourceRow[], options: { query: string; hideIdle: boolean; sort: ResourceSort }): ResourceRow[] {
  const query = options.query.trim().toLowerCase()
  return rows
    .filter((row) => (query ? row.label.toLowerCase().includes(query) || row.name.includes(query) : true))
    .filter((row) => (options.hideIdle ? row.health !== 'idle' : true))
    .sort((a, b) => (options.sort === 'name' ? a.label.localeCompare(b.label) : b.percent - a.percent || a.label.localeCompare(b.label)))
}

const csvCell = (value: string | number) => {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(data: RateLimitData): string {
  const header = ['resource', 'limit', 'used', 'remaining', 'percent_used', 'health', 'resets_at']
  const lines = resourceRows(data)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => [
      row.name,
      row.resource.limit,
      row.resource.used,
      row.resource.remaining,
      row.percent.toFixed(2),
      row.health,
      row.resource.reset > 0 ? new Date(row.resource.reset * 1000).toISOString() : '',
    ].map(csvCell).join(','))
  return [header.join(','), ...lines].join('\n')
}

/* ---------- Hour × day usage grid (for the 3D heatmap) ---------- */

export interface UsageCell {
  /** 0 = oldest day shown. */
  col: number
  /** Hour of day, 0-23. */
  row: number
  /** Highest core `used` seen in that hour, or null when nothing was captured. */
  value: number | null
  /** Start of the hour (ms). */
  at: number
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** `tzOffsetMinutes` shifts UTC to the viewer's local time (pass `-new Date().getTimezoneOffset()`). */
export function usageGrid(snapshots: RateLimitSnapshot[], now: number, days = 10, tzOffsetMinutes = 0): { cells: UsageCell[]; cols: number } {
  const shift = tzOffsetMinutes * 60_000
  const todayStart = Math.floor((now + shift) / DAY) * DAY - shift
  const firstDay = todayStart - (days - 1) * DAY
  const peaks = new Map<number, number>()

  for (const snapshot of snapshots) {
    const t = Date.parse(snapshot.captured_at)
    if (!(t >= firstDay && t <= now)) continue
    const bucket = Math.floor((t - firstDay) / HOUR)
    peaks.set(bucket, Math.max(peaks.get(bucket) ?? 0, snapshot.payload.rate.used))
  }

  const cells: UsageCell[] = []
  for (let col = 0; col < days; col++) {
    for (let row = 0; row < 24; row++) {
      const bucket = col * 24 + row
      cells.push({ col, row, value: peaks.get(bucket) ?? null, at: firstDay + bucket * HOUR })
    }
  }
  return { cells, cols: days }
}
