import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/utils'
import type { RateLimitSnapshot } from '../rateLimitClient'

type TimeRange = '24h' | '10d'

function formatTime(value: number, range: TimeRange): string {
  const date = new Date(value)
  return range === '24h'
    ? date.toLocaleTimeString([], { hour: 'numeric' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function RateLimitHistoryChart({
  snapshots,
  isLoading,
}: {
  snapshots: RateLimitSnapshot[]
  isLoading: boolean
}) {
  const [range, setRange] = useState<TimeRange>('24h')
  const rangeMs = (range === '24h' ? 24 : 10 * 24) * 60 * 60 * 1000
  const now = Date.now()
  const earliest = now - rangeMs
  const data = useMemo(
    () => snapshots
      .filter((snapshot) => {
        const timestamp = Date.parse(snapshot.captured_at)
        return timestamp >= earliest && timestamp <= now
      })
      .map((snapshot) => ({
        timestamp: Date.parse(snapshot.captured_at),
        used: snapshot.payload.rate.used,
      })),
    [earliest, now, snapshots],
  )
  const maxUsed = Math.max(10, ...data.map((point) => point.used))
  const yMax = Math.ceil(maxUsed / 10) * 10

  return (
    <div className="border-t border-slate-200/80 px-4 pb-4 pt-5 dark:border-slate-700/80 sm:px-6 sm:pb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Historical usage graph · hourly trend</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Core REST API requests used · captured every 30 minutes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:inline">
            {range === '24h' ? 'Last 24 hours' : 'Last 10 days'}
          </span>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" aria-label="History range">
            {(['24h', '10d'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                aria-pressed={range === value}
                className={range === value
                  ? 'h-8 min-h-8 rounded-lg px-3 text-xs'
                  : 'h-8 min-h-8 rounded-lg border-transparent bg-transparent px-3 text-xs text-slate-600 shadow-none hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}
              >
                {value === '24h' ? '24 hours' : '10 days'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div role="status" className="flex h-[260px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Loading history…
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-[260px] flex-col items-center justify-center text-center">
          <div className="mb-3 size-10 rounded-full border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-500 dark:text-cyan-300">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-full">
              <path d="M3 17.5 8 12l4 3 8-9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 6h5v5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-medium">Your history is warming up</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            Scheduled snapshots will appear here as they are collected, every 30 minutes.
          </p>
        </div>
      ) : (
        <div
          role="img"
          aria-label={`Core API usage history for the last ${range === '24h' ? '24 hours' : '10 days'}`}
          className="h-[240px] w-full sm:h-[280px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="rate-history-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={[earliest, now]}
                tickCount={range === '24h' ? 7 : 6}
                tickFormatter={(value: number) => formatTime(value, range)}
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
                stroke="#22d3ee"
                strokeWidth={2.5}
                fill="url(#rate-history-gradient)"
                activeDot={{ r: 5, stroke: '#e0f2fe', strokeWidth: 2, fill: '#06b6d4' }}
                dot={data.length <= 48 ? { r: 2.5, strokeWidth: 0, fill: '#67e8f9' } : false}
                isAnimationActive="auto"
                animationDuration={850}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
