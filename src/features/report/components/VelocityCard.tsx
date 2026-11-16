import { motion, useMotionValue, useReducedMotion, useTransform, animate } from 'framer-motion'
import { useEffect, useId, useMemo } from 'react'
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { useCountUp, useInViewOnce } from '../hooks'
import { GAUGE_MAX, gaugeZone, starGrowth, velocity, type Day } from '../metrics'
import type { Report } from '@/services/github/schema'
import { ChartTooltip } from './ChartTooltip'

/* ------------------------------------- Gauge ------------------------------------- */

const CX = 100
const CY = 100
const R = 78
const pt = (deg: number, radius: number) => ({ x: CX + radius * Math.cos((deg * Math.PI) / 180), y: CY + radius * Math.sin((deg * Math.PI) / 180) })

function Gauge({ value, play }: { value: number; play: boolean }) {
  const id = useId()
  const reduced = useReducedMotion()
  const fraction = Math.min(1, value / GAUGE_MAX)
  const angle = useMotionValue(180) // degrees; 180 = far left, 360 = far right
  const tip = useTransform(angle, (a) => pt(a, R - 12))
  const x2 = useTransform(tip, (p) => p.x)
  const y2 = useTransform(tip, (p) => p.y)

  useEffect(() => {
    if (!play) return
    const target = 180 + 180 * fraction
    if (reduced) {
      angle.set(target)
      return
    }
    const controls = animate(angle, target, { type: 'spring', stiffness: 38, damping: 11, mass: 1.1, delay: 0.25 })
    return () => controls.stop()
  }, [play, fraction, reduced, angle])

  const start = pt(180, R)
  const end = pt(360, R)
  const arc = `M${start.x} ${start.y} A${R} ${R} 0 0 1 ${end.x} ${end.y}`
  const ticks = [0, 10, 20, 30, 40]

  return (
    <svg viewBox="0 0 200 122" className="mx-auto w-full max-w-[330px]" role="img" aria-label={`Velocity ${value} contributions per week`}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={arc} fill="none" strokeWidth="13" strokeLinecap="round" style={{ stroke: 'var(--r-track)' }} />
      <motion.path d={arc} fill="none" stroke={`url(#${id}-g)`} strokeWidth="13" strokeLinecap="round" filter={`url(#${id}-glow)`} initial={{ pathLength: 0 }} animate={{ pathLength: play ? Math.max(0.015, fraction) : 0 }} transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.25 }} />
      {ticks.map((t) => {
        const a = 180 + 180 * (t / GAUGE_MAX)
        const o = pt(a, R + 11)
        const i = pt(a, R + 7)
        const l = pt(a, R + 20)
        return (
          <g key={t}>
            <line x1={i.x} y1={i.y} x2={o.x} y2={o.y} strokeWidth="1" style={{ stroke: 'var(--r-muted)' }} />
            <text x={l.x} y={l.y + 2} fontSize="7" textAnchor="middle" style={{ fill: 'var(--r-muted)' }}>{t}</text>
          </g>
        )
      })}
      <motion.line x1={CX} y1={CY} x2={x2} y2={y2} strokeWidth="2.5" strokeLinecap="round" style={{ stroke: 'var(--r-text)' }} />
      <circle cx={CX} cy={CY} r="6" style={{ fill: 'var(--r-text)' }} />
      <circle cx={CX} cy={CY} r="2.4" style={{ fill: 'var(--r-tooltip-bg)' }} />
    </svg>
  )
}

/* ------------------------------------ Mini charts ------------------------------------ */

function MiniArea({ data, dataKey, id, color, play, tooltip }: { data: Array<Record<string, unknown>>; dataKey: string; id: string; color: string; play: boolean; tooltip: React.ReactElement }) {
  const reduced = useReducedMotion()
  if (!play) return <div className="h-20" />
  return (
    <div className="h-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip content={tooltip} cursor={{ stroke: color, strokeOpacity: 0.4, strokeDasharray: '3 3' }} />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={!reduced} animationDuration={1400} dot={false} activeDot={{ r: 3.5, strokeWidth: 0, fill: color }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartBlock({ title, value, children, className }: { title: string; value?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{title}</span>
        {value ? <span className="text-xs font-semibold tabular-nums">{value}</span> : null}
      </div>
      {children}
    </div>
  )
}

const shortDate = (date: unknown) => (typeof date === 'string' ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '')

/* ------------------------------------- Main export ------------------------------------ */

export function VelocityContent({ days, starsByYear }: { days: Day[]; starsByYear: Report['starsByYear'] }) {
  const reduced = useReducedMotion()
  const [ref, seen] = useInViewOnce<HTMLDivElement>('0px 0px -5% 0px')
  const v = useMemo(() => velocity(days), [days])
  const stars = useMemo(() => starGrowth(starsByYear, new Date().getUTCFullYear()), [starsByYear])
  const zone = gaugeZone(v.perWeek)
  const shown = useCountUp(v.perWeek, { duration: 1.6, enabled: seen })

  return (
    <div ref={ref} className="grid items-stretch gap-3 md:grid-cols-[1fr_1.25fr_1fr]">
      <div className="flex flex-col gap-3">
        <ChartBlock title="Daily activity" value={`${v.last30} in 30 days`}>
          <MiniArea data={v.daily as unknown as Array<Record<string, unknown>>} dataKey="count" id="r-vel-a" color="var(--r-accent)" play={seen} tooltip={<ChartTooltip unit="contributions" title={(_, row) => shortDate(row?.date)} />} />
        </ChartBlock>
        <ChartBlock title="Weekly rhythm" value="last 12 weeks" className="flex-1">
          <div className="h-20">
            {seen ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={v.weekly} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="r-vel-w" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--r-accent-2)" />
                      <stop offset="100%" stopColor="var(--r-accent)" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <Tooltip cursor={{ fill: 'var(--r-grid)' }} content={<ChartTooltip unit="contributions" title={(label) => `Week of ${shortDate(label)}`} />} />
                  <Bar dataKey="count" fill="url(#r-vel-w)" radius={[4, 4, 0, 0]} isAnimationActive={!reduced} animationDuration={1200} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </ChartBlock>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/70 bg-gradient-to-b from-indigo-50/60 to-transparent p-3 dark:border-white/[0.06] dark:from-indigo-400/[0.07]">
        <Gauge value={v.perWeek} play={seen} />
        <div className="-mt-1 text-center">
          <div className="text-3xl font-bold tabular-nums tracking-tight" data-testid="velocity-value">{shown.toFixed(1)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">contributions / week · 30-day avg</div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{zone.label}</span>
            {v.deltaPct !== null ? (
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums', v.deltaPct >= 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300')}>
                {v.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(v.deltaPct)}% vs prev 30d
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <ChartBlock title="Star growth" value={stars.length ? `${stars[stars.length - 1]?.cumulative.toLocaleString('en')} ★` : undefined} className="flex-1">
          {stars.length > 1 ? (
            <MiniArea data={stars as unknown as Array<Record<string, unknown>>} dataKey="cumulative" id="r-vel-s" color="var(--r-amber)" play={seen} tooltip={<ChartTooltip unit="★ on repos created by then" title={(_, row) => `By ${String(row?.year ?? '')}`} />} />
          ) : (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{stars.length === 1 ? 'Not enough history to chart yet.' : 'No original repositories yet.'}</p>
          )}
          <p className="mt-1 text-[0.65rem] text-slate-500">Stars on repos, by the year each repo was created.</p>
        </ChartBlock>
        <ChartBlock title="Peak week" value={`${Math.max(0, ...v.weekly.map((w) => w.count))}`}>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Most contributions in a single week of the last 12.</p>
        </ChartBlock>
      </div>
    </div>
  )
}
