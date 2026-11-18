import { motion } from 'framer-motion'
import { formatCount } from '@/lib/utils'
import { HEALTH_META, formatDuration, healthOf, percentUsed, type Forecast } from '../insights'
import type { RateLimitResource } from '../rateLimitClient'
import { CountUp } from './CountUp'

interface Props {
  core: RateLimitResource
  burn: number | null
  projection: Forecast | null
  now: number
}

export function KpiStrip({ core, burn, projection, now }: Props) {
  const percent = percentUsed(core)
  const health = HEALTH_META[healthOf(core)]
  const untilReset = core.reset > 0 ? Math.max(0, core.reset * 1000 - now) : null

  const tiles = [
    { label: 'Requests used', value: <CountUp value={core.used} />, hint: `of ${formatCount(core.limit)} per hour`, accent: '#22d3ee' },
    { label: 'Remaining', value: <CountUp value={core.remaining} />, hint: 'before throttling', accent: '#34d399' },
    {
      label: 'Utilization',
      value: <><CountUp value={percent} format={(n) => n.toFixed(n < 10 ? 1 : 0)} />%</>,
      hint: health.label,
      accent: health.color,
    },
    {
      label: 'Burn rate',
      value: burn === null ? '—' : <><CountUp value={burn} format={(n) => n.toFixed(1)} /><span className="ml-1 text-sm font-medium text-slate-500">/min</span></>,
      hint: burn === null ? 'collecting samples' : 'last 5 minutes',
      accent: '#a78bfa',
    },
    {
      label: 'Projected at window end',
      value: projection ? <CountUp value={projection.projectedAtReset} /> : '—',
      hint: projection ? (projection.exhaustsInMs !== null ? `empty in ~${formatDuration(projection.exhaustsInMs)}` : 'within the limit') : 'needs a burn rate',
      accent: '#fbbf24',
    },
    { label: 'Window resets in', value: untilReset === null ? '—' : formatDuration(untilReset), hint: 'rolling hourly window', accent: '#60a5fa' },
  ]

  return (
    <ul aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile, i) => (
        <motion.li
          key={tile.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 shadow-lg shadow-slate-900/[0.04] backdrop-blur dark:border-white/[0.08] dark:bg-slate-900/70 dark:shadow-black/30 sm:p-4"
        >
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${tile.accent}, transparent)` }} />
          <p className="truncate text-[0.68rem] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{tile.label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold tabular-nums tracking-tight sm:text-[1.7rem]">{tile.value}</p>
          <p className="mt-0.5 truncate text-xs" style={{ color: tile.accent }}>{tile.hint}</p>
        </motion.li>
      ))}
    </ul>
  )
}
