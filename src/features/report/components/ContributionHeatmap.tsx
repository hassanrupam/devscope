import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { useCountUp, useInViewOnce } from '../hooks'
import {
  cubeHeight,
  cubePaths,
  drawOrder,
  heatColor,
  HEAT_GRADIENT,
  intensity,
  layoutCells,
  project,
  sceneSize,
  type Cell,
} from '../isoGeometry'
import { summarizeCalendar, type Day } from '../metrics'
import { ChartTooltip } from './ChartTooltip'

type Mode = '3d' | 'flat'

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const shade = (color: string, amount: number) => `color-mix(in srgb, ${color}, black ${amount}%)`

interface Hover {
  cell: Cell
  left: number
  top: number
}

function useHover() {
  const wrapper = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const show = (cell: Cell, target: Element) => {
    const box = wrapper.current?.getBoundingClientRect()
    if (!box) return
    const rect = target.getBoundingClientRect()
    setHover({ cell, left: rect.left - box.left + rect.width / 2, top: rect.top - box.top })
  }
  return { wrapper, hover, show, hide: () => setHover(null) }
}

/* ---------------------------------- 3D (isometric) ---------------------------------- */

function IsoScene({ days, loading, onHover, onLeave }: { days: Day[]; loading: boolean; onHover: (c: Cell, el: Element) => void; onLeave: () => void }) {
  const { cells, cols } = useMemo(() => layoutCells(days), [days])
  const ordered = useMemo(() => drawOrder(cells), [cells])
  const max = useMemo(() => Math.max(1, ...cells.map((c) => c.count)), [cells])
  const scene = sceneSize(cols)

  return (
    <svg viewBox={`0 0 ${scene.width} ${scene.height}`} className="h-auto w-full overflow-visible" role="img" aria-label="Isometric contribution heatmap for the last year">
      {ordered.map((cell) => {
        const { x, y } = project(cell.col, cell.row, cols)
        const height = loading ? 0 : cubeHeight(cell.count, max)
        const t = intensity(cell.count, max)
        const active = !loading && cell.count > 0
        const color = active ? heatColor(t) : 'var(--r-empty)'
        const paths = cubePaths(x, y, height)
        return (
          <g
            key={cell.index}
            className={cn('r-cube-col', loading && 'r-tile')}
            style={{
              animationDelay: loading ? `${(cell.col + cell.row) * 45}ms` : `${cell.col * 14 + cell.row * 6}ms`,
              filter: t > 0.82 && active ? `drop-shadow(0 0 5px ${color})` : undefined,
            }}
            onPointerEnter={(e) => !loading && onHover(cell, e.currentTarget)}
            onPointerLeave={onLeave}
          >
            {active ? (
              <>
                <path d={paths.left} fill={shade(color, 32)} />
                <path d={paths.right} fill={shade(color, 52)} />
              </>
            ) : null}
            <path d={paths.top} fill={color} opacity={active ? 1 : 0.85} />
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------- Flat grid ------------------------------------- */

function FlatGrid({ days, onHover, onLeave }: { days: Day[]; onHover: (c: Cell, el: Element) => void; onLeave: () => void }) {
  const { cells, cols } = useMemo(() => layoutCells(days), [days])
  const max = useMemo(() => Math.max(1, ...cells.map((c) => c.count)), [cells])
  const size = 11
  const step = 14.5
  const left = 26
  const top = 18

  const months = useMemo(() => {
    const out: Array<{ col: number; label: string }> = []
    let previous = ''
    for (const cell of cells) {
      if (cell.row !== 0) continue
      const month = cell.date.slice(0, 7)
      if (month !== previous) {
        out.push({ col: cell.col, label: new Date(`${cell.date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }) })
        previous = month
      }
    }
    return out
  }, [cells])

  return (
    <svg viewBox={`0 0 ${left + cols * step} ${top + 7 * step}`} className="h-auto w-full" role="img" aria-label="Contribution heatmap for the last year">
      {months.map((m) => (
        <text key={m.col} x={left + m.col * step} y={10} fontSize="9" style={{ fill: 'var(--r-muted)' }}>
          {m.label}
        </text>
      ))}
      {['Mon', 'Wed', 'Fri'].map((d, i) => (
        <text key={d} x={0} y={top + (i * 2 + 1) * step + size - 2} fontSize="9" style={{ fill: 'var(--r-muted)' }}>
          {d}
        </text>
      ))}
      {cells.map((cell) => {
        const t = intensity(cell.count, max)
        return (
          <rect
            key={cell.index}
            className="r-pop"
            x={left + cell.col * step}
            y={top + cell.row * step}
            width={size}
            height={size}
            rx={3}
            fill={cell.count > 0 ? heatColor(t) : 'var(--r-empty)'}
            style={{ animationDelay: `${cell.col * 12 + cell.row * 4}ms` }}
            onPointerEnter={(e) => onHover(cell, e.currentTarget)}
            onPointerLeave={onLeave}
          />
        )
      })}
    </svg>
  )
}

/* ------------------------------------ Monthly bars ----------------------------------- */

function MonthlyBars({ days }: { days: Day[] }) {
  const reduced = useReducedMotion()
  const [ref, seen] = useInViewOnce<HTMLDivElement>()
  const data = useMemo(() => {
    const byMonth = new Map<string, number>()
    for (const d of days) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d.count)
    return [...byMonth.entries()].map(([key, count]) => ({
      key,
      count,
      label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }),
    }))
  }, [days])

  return (
    <div ref={ref} className="h-24" aria-hidden="true">
      {seen ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="r-month-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--r-accent-2)" />
                <stop offset="100%" stopColor="var(--r-accent)" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--r-muted)' }} interval={0} />
            <Tooltip cursor={{ fill: 'var(--r-grid)' }} content={<ChartTooltip unit="contributions" />} />
            <Bar dataKey="count" fill="url(#r-month-fill)" radius={[5, 5, 0, 0]} isAnimationActive={!reduced} animationDuration={1100} />
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  )
}

/* -------------------------------------- Summary -------------------------------------- */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="text-[0.65rem] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
      {hint ? <div className="truncate text-[0.7rem] text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  )
}

function Summary({ days }: { days: Day[] }) {
  const summary = useMemo(() => summarizeCalendar(days), [days])
  const total = useCountUp(summary.total)
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Contributions" value={Math.round(total).toLocaleString('en')} hint="last 12 months" />
      <Stat label="Active days" value={`${summary.activeDays}`} hint={`of ${days.length} days`} />
      <Stat label="Busiest day" value={`${summary.maxCount}`} hint={summary.busiest ? formatDate(summary.busiest.date) : '—'} />
      <Stat label="Avg / active day" value={`${summary.averagePerActiveDay}`} />
    </dl>
  )
}

/* ------------------------------------- Main export ------------------------------------ */

export function ContributionHeatmap({ days, loading = false }: { days: Day[]; loading?: boolean }) {
  const [mode, setMode] = useState<Mode>('3d')
  const { wrapper, hover, show, hide } = useHover()

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[0.7rem] text-slate-500 dark:text-slate-400" aria-hidden="true">
          Less
          <span className="h-2 w-24 rounded-full" style={{ background: HEAT_GRADIENT }} />
          More
        </div>
        <div role="group" aria-label="Heatmap view" className="r-no-print inline-flex rounded-lg border border-slate-200/80 p-0.5 text-xs dark:border-white/10">
          {(['3d', 'flat'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'relative rounded-md px-2.5 py-1 font-medium transition-colors',
                mode === m ? 'text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              )}
            >
              {mode === m ? <motion.span layoutId="heatmap-mode" className="absolute inset-0 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600" transition={{ type: 'spring', stiffness: 500, damping: 36 }} /> : null}
              <span className="relative">{m === '3d' ? '3D' : 'Flat'}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapper} className="relative flex min-h-48 flex-1 items-center justify-center" onPointerLeave={hide}>
        <div className="w-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25 }}
            >
              {mode === '3d' || loading ? (
                <IsoScene days={days} loading={loading} onHover={show} onLeave={hide} />
              ) : (
                <FlatGrid days={days} onHover={show} onLeave={hide} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {hover ? (
            <motion.div
              key="tip"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs shadow-xl backdrop-blur"
              style={{ left: hover.left, top: hover.top - 6, background: 'var(--r-tooltip-bg)', borderColor: 'var(--r-tooltip-border)', color: 'var(--r-text)' }}
            >
              <span className="font-semibold tabular-nums">{hover.cell.count}</span> contribution{hover.cell.count === 1 ? '' : 's'}
              <span style={{ color: 'var(--r-muted)' }}> · {formatDate(hover.cell.date)}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {loading ? null : (
        <>
          <Summary days={days} />
          <div>
            <div className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">By month</div>
            <MonthlyBars days={days} />
          </div>
        </>
      )}
    </div>
  )
}
