import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/utils'
import type { RateLimitSnapshot } from '../rateLimitClient'

export const LIVE_SAMPLE_INTERVAL_MS = 5_000
export const LIVE_TREND_WINDOW_MS = 60 * 60 * 1000

export type RateLimitTrendMode = 'live' | '24h'
export type LiveRateSample = { timestamp: number; used: number }
export type LiveWindow = '1m' | '5m' | '10m' | '30m' | '1h'
type TrendPoint = { timestamp: number; used: number | null }

const HOUR_MS = 60 * 60 * 1000
const LIVE_WINDOWS: Record<LiveWindow, { label: string; longLabel: string; milliseconds: number }> = {
  '1m': { label: '1m', longLabel: '1 minute', milliseconds: 60_000 },
  '5m': { label: '5m', longLabel: '5 minutes', milliseconds: 5 * 60_000 },
  '10m': { label: '10m', longLabel: '10 minutes', milliseconds: 10 * 60_000 },
  '30m': { label: '30m', longLabel: '30 minutes', milliseconds: 30 * 60_000 },
  '1h': { label: '1h', longLabel: '1 hour', milliseconds: HOUR_MS },
}
const LIVE_WINDOW_VALUES: LiveWindow[] = ['1m', '5m', '10m', '30m', '1h']

export function buildHourlyTrend(snapshots: RateLimitSnapshot[], now: number): TrendPoint[] {
  const firstHour = Math.floor(now / HOUR_MS) * HOUR_MS - 23 * HOUR_MS
  const latestByHour = new Map<number, { timestamp: number; used: number }>()

  for (const snapshot of snapshots) {
    const timestamp = Date.parse(snapshot.captured_at)
    if (timestamp < now - 24 * HOUR_MS || timestamp > now) continue

    const hour = Math.floor(timestamp / HOUR_MS) * HOUR_MS
    const latest = latestByHour.get(hour)
    if (!latest || timestamp > latest.timestamp) {
      latestByHour.set(hour, { timestamp, used: snapshot.payload.rate.used })
    }
  }

  return Array.from({ length: 24 }, (_, index) => {
    const hour = firstHour + index * HOUR_MS
    return latestByHour.get(hour) ?? { timestamp: hour, used: null }
  })
}

export function buildLiveTrend(
  samples: LiveRateSample[],
  now: number,
  windowMs: number,
): TrendPoint[] {
  const earliest = now - windowMs
  const points = samples
    .filter((sample) => sample.timestamp >= earliest && sample.timestamp <= now)
    .map((sample) => ({ timestamp: sample.timestamp, used: sample.used }))
  const latest = points.at(-1)

  if (latest && latest.timestamp < now && now - latest.timestamp <= LIVE_SAMPLE_INTERVAL_MS * 2) {
    points.push({ timestamp: now, used: latest.used })
  }
  return points
}

function formatTime(value: number, mode: RateLimitTrendMode, liveWindow: LiveWindow): string {
  const date = new Date(value)
  if (mode === '24h') return date.toLocaleTimeString([], { hour: 'numeric' })
  return liveWindow === '1m' || liveWindow === '5m' || liveWindow === '10m'
    ? date.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function LiveSampleAge({ timestamp }: { timestamp: number | undefined }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const ageSeconds = timestamp === undefined ? null : Math.max(0, Math.floor((now - timestamp) / 1000))
  return (
    <span role="timer" aria-label="Live trend sample age">
      {ageSeconds === null ? 'waiting for sample' : `updated ${ageSeconds}s ago`}
    </span>
  )
}

export function RateLimitHistoryChart({
  snapshots,
  liveSamples,
  mode,
  onModeChange,
  isLoading,
  liveError,
}: {
  snapshots: RateLimitSnapshot[]
  liveSamples: LiveRateSample[]
  mode: RateLimitTrendMode
  onModeChange: (mode: RateLimitTrendMode) => void
  isLoading: boolean
  liveError: string | null
}) {
  const [liveWindow, setLiveWindow] = useState<LiveWindow>('5m')
  const [clockNow, setClockNow] = useState(Date.now)
  useEffect(() => {
    if (mode !== 'live') return
    setClockNow(Date.now())
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [mode])

  const now = mode === 'live' ? clockNow : Date.now()
  const selectedWindow = LIVE_WINDOWS[liveWindow]
  const earliest = now - (mode === 'live' ? selectedWindow.milliseconds : 24 * HOUR_MS)
  const lastSampleAt = liveSamples.at(-1)?.timestamp
  const data = useMemo(
    () => mode === 'live'
      ? buildLiveTrend(liveSamples, now, selectedWindow.milliseconds)
      : buildHourlyTrend(snapshots, now),
    [liveSamples, liveWindow, mode, now, selectedWindow.milliseconds, snapshots],
  )
  const hasData = data.some((point) => point.used !== null)
  const maxUsed = Math.max(10, ...data.flatMap((point) => point.used === null ? [] : [point.used]))
  const yMax = Math.ceil(maxUsed / 10) * 10
  const isLive = mode === 'live'
  const values = data.flatMap((point) => (point.used === null ? [] : [point.used]))
  const latestUsed = values.at(-1)
  const minUsed = values.length ? Math.min(...values) : 0
  const gained = values.length > 1 ? (latestUsed ?? 0) - (values[0] ?? 0) : 0

  return (
    <div className="border-t border-slate-200/80 px-4 pb-4 pt-5 dark:border-white/[0.08] sm:px-6 sm:pb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">{isLive ? `Live usage trend · last ${selectedWindow.longLabel}` : 'Historical usage graph · hourly'}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isLive
              ? 'Core REST API requests used · sampled every 5 seconds, smoothly animated between readings'
              : 'Core REST API requests used · latest saved snapshot in each hour'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">
            {isLive ? (
              <>
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none dark:bg-emerald-400" />
                <span>Live · <LiveSampleAge timestamp={lastSampleAt} /></span>
              </>
            ) : 'Last 24 hours · hourly'}
          </span>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]" role="group" aria-label="Usage trend range">
            {(['live', '24h'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                onClick={() => onModeChange(value)}
                aria-pressed={mode === value}
                className={mode === value
                  ? 'h-8 min-h-8 rounded-lg px-3 text-xs'
                  : 'h-8 min-h-8 rounded-lg border-transparent bg-transparent px-3 text-xs text-slate-600 shadow-none hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}
              >
                {value === 'live' ? 'Live' : '24h hourly'}
              </Button>
            ))}
          </div>
          {isLive ? (
            <div className="flex gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]" role="group" aria-label="Live trend window">
              {LIVE_WINDOW_VALUES.map((value) => {
                const option = LIVE_WINDOWS[value]
                return (
                  <Button
                    key={value}
                    type="button"
                    onClick={() => setLiveWindow(value)}
                    aria-label={option.longLabel}
                    aria-pressed={liveWindow === value}
                    className={liveWindow === value
                      ? 'h-8 min-h-8 rounded-lg px-2 text-[10px]'
                      : 'h-8 min-h-8 rounded-lg border-transparent bg-transparent px-2 text-[10px] text-slate-600 shadow-none hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      {hasData ? (
        <dl className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {[
            ['Latest', formatCount(latestUsed ?? 0)],
            ['Peak', formatCount(Math.max(...values))],
            ['Low', formatCount(minUsed)],
            ['Change', `${gained >= 0 ? '+' : ''}${formatCount(gained)}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
              <dt className="text-[0.65rem] uppercase tracking-wider text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {isLive && liveError ? (
        <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          Live trend could not be refreshed: {liveError}
        </p>
      ) : null}

      {(!isLive && isLoading) ? (
        <div role="status" className="flex h-[260px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Loading hourly history…
        </div>
      ) : !hasData ? (
        <div className="flex h-[260px] flex-col items-center justify-center text-center">
          <div className="mb-3 size-10 rounded-full border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-500 dark:text-cyan-300">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-full">
              <path d="M3 17.5 8 12l4 3 8-9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 6h5v5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-medium">{isLive ? 'Live trend is starting' : 'Hourly history is warming up'}</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            {isLive
              ? 'This tab collects a sample every 5 seconds. Saved samples remain available for the latest hour.'
              : 'Saved snapshots are collected every 30 minutes and grouped into hourly points.'}
          </p>
        </div>
      ) : (
        <div
          role="img"
          aria-label={isLive
            ? `Core API live usage trend for the last ${selectedWindow.longLabel}`
            : 'Core API usage history for the last 24 hours, hourly'}
          className="h-[240px] w-full sm:h-[280px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="rate-history-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.42} />
                  <stop offset="55%" stopColor="#6366f1" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="rate-history-stroke" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={[earliest, now]}
                tickCount={7}
                tickFormatter={(value: number) => formatTime(value, mode, liveWindow)}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={[0, yMax]}
                allowDecimals={false}
                tickFormatter={formatCount}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <Tooltip
                animationDuration={160}
                contentStyle={{
                  backgroundColor: 'var(--chart-tooltip-bg)',
                  border: '1px solid var(--chart-tooltip-border)',
                  borderRadius: '12px',
                  boxShadow: '0 12px 30px rgb(2 6 23 / 0.22)',
                  color: 'var(--chart-tooltip-text)',
                  padding: '10px 12px',
                }}
                labelStyle={{ color: 'var(--chart-tooltip-muted)', fontSize: 11, marginBottom: 4 }}
                itemStyle={{ color: 'var(--chart-tooltip-text)', fontSize: 13, fontWeight: 600 }}
                labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
                formatter={(value) => [`${formatCount(Number(value))} requests`, 'Used']}
                cursor={{ stroke: '#22d3ee', strokeDasharray: '4 4', strokeOpacity: 0.65 }}
              />
              <Area
                type="monotone"
                dataKey="used"
                name="Used"
                stroke="url(#rate-history-stroke)"
                strokeWidth={2.75}
                fill="url(#rate-history-gradient)"
                activeDot={{ r: 5, stroke: '#e0f2fe', strokeWidth: 2, fill: '#06b6d4' }}
                dot={!isLive && data.length <= 24 ? { r: 2.5, strokeWidth: 0, fill: '#67e8f9' } : false}
                isAnimationActive={isLive}
                animationDuration={950}
                animationEasing="linear"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
