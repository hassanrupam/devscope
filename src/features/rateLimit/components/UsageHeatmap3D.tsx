import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { heatColor, HEAT_GRADIENT, intensity, cubeHeight, type IsoMetrics } from '@/features/report/isoGeometry'
import { usageGrid } from '../insights'
import type { RateLimitSnapshot } from '../rateLimitClient'
import { IsoField, type IsoCell } from './IsoField'

const METRICS: IsoMetrics = { w: 13, h: 7.4, maxH: 84, minH: 4, gap: 0.14 }
const DAYS = 10

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtHour = (ms: number) => new Date(ms).toLocaleTimeString('en', { hour: 'numeric' })

/** 3D heatmap of the busiest moment per hour over the last 10 days (columns = days, rows = hours). */
export function UsageHeatmap3D({ snapshots, loading }: { snapshots: RateLimitSnapshot[]; loading: boolean }) {
  const { cells: grid, cols } = useMemo(
    // eslint-disable-next-line react-hooks/purity -- the window is anchored to "now" when the data arrives
    () => usageGrid(snapshots, Date.now(), DAYS, -new Date().getTimezoneOffset()),
    [snapshots],
  )
  const max = Math.max(1, ...grid.map((c) => c.value ?? 0))
  const hasData = grid.some((c) => c.value !== null)

  const cells: IsoCell<(typeof grid)[number]>[] = grid.map((c) => {
    const active = c.value !== null && c.value > 0
    return {
      key: `${c.col}-${c.row}`,
      col: c.col,
      row: c.row,
      height: active ? cubeHeight(c.value ?? 0, max, METRICS) : 0,
      color: active ? heatColor(intensity(c.value ?? 0, max)) : 'var(--r-empty)',
      glow: active && intensity(c.value ?? 0, max) > 0.85,
      delay: c.col * 60 + c.row * 8,
      data: c,
    }
  })

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between text-[0.7rem] text-slate-500 dark:text-slate-400" aria-hidden="true">
        <span>Quiet</span>
        <span className="mx-2 h-2 flex-1 rounded-full" style={{ background: HEAT_GRADIENT }} />
        <span>Peak {max.toLocaleString('en')}</span>
      </div>

      <div className={cn('relative flex-1', !hasData && !loading && 'opacity-60')}>
        <IsoField
          cells={cells}
          cols={cols}
          rows={24}
          metrics={METRICS}
          loading={loading || !hasData}
          label="3D heatmap of core API usage by hour over the last 10 days"
          className="mx-auto w-full max-w-[620px]"
          renderTip={({ data }) => (
            <>
              <div className="font-semibold tabular-nums">{data.value === null ? 'No snapshot' : `${data.value.toLocaleString('en')} requests used (peak)`}</div>
              <div style={{ color: 'var(--r-muted)' }}>
                {fmtDay(data.at)} · {fmtHour(data.at)}
              </div>
            </>
          )}
        />
        {!hasData && !loading ? (
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-slate-500 dark:text-slate-400">
            Warming up — one snapshot is saved every 30 minutes and grouped by hour.
          </p>
        ) : null}
      </div>
      <p className="text-[0.65rem] text-slate-500">Columns are days (oldest → today), rows are hours of the day · height = highest core usage seen in that hour.</p>
    </div>
  )
}
