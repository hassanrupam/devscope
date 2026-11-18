import { useId, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import { formatCount } from '@/lib/utils'
import { HEALTH_META, filterRows, type ResourceRow, type ResourceSort } from '../insights'
import type { RateLimitSnapshot } from '../rateLimitClient'
import { ResetCountdown } from './ResetCountdown'

function Spark({ name, values, color }: { name: string; values: number[]; color: string }) {
  const id = `spark-${name}-${useId().replaceAll(':', '')}`
  if (values.length < 2) return <div className="flex h-11 min-w-0 flex-1 items-center justify-end text-[10px] text-slate-400 dark:text-slate-500">Trend collecting</div>
  return (
    <div aria-hidden="true" className="h-11 min-w-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={values.map((used) => ({ used }))}>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="used" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive="auto" animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function Card({ row, history, index }: { row: ResourceRow; history: RateLimitSnapshot[]; index: number }) {
  const meta = HEALTH_META[row.health]
  const { resource, percent, label, name } = row
  const values = history.flatMap((s) => {
    const v = s.payload.resources[name]?.used
    return v === undefined ? [] : [v]
  })
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index, 10) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-md shadow-slate-900/[0.03] transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-white/[0.08] dark:bg-slate-900/70 dark:shadow-black/30 sm:p-5"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-36 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-25" style={{ background: meta.color }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold sm:text-[15px]">{label}</h3>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{formatCount(resource.remaining)} remaining</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-semibold tabular-nums">{percent < 1 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`} used</span>
          <span className="rounded-full px-2 py-0.5 text-[0.62rem] font-semibold" style={{ background: `${meta.color}26`, color: meta.color }}>{meta.label}</span>
        </div>
      </div>
      <div
        role="meter"
        aria-label={`${label} quota used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${formatCount(resource.used)} of ${formatCount(resource.limit)} used`}
        className="mt-4 h-2 overflow-hidden rounded-full"
        style={{ background: 'var(--r-track)' }}
      >
        <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${percent}%`, background: `linear-gradient(90deg, #22d3ee, ${meta.color})`, boxShadow: `0 0 14px ${meta.color}80` }} />
      </div>
      <div className="mt-3 flex items-end gap-3">
        <div className="shrink-0 tabular-nums">
          <p className="text-xl font-bold leading-none">{formatCount(resource.used)}</p>
          <p className="mt-1 text-[10px] text-slate-500">of {formatCount(resource.limit)}</p>
        </div>
        <Spark name={name} values={values} color={meta.color} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-[10px] text-slate-500 dark:border-white/[0.08] dark:text-slate-400 sm:text-[11px]">
        <span className="uppercase tracking-wider">Reset countdown</span>
        <span className="flex items-center gap-1">
          <span>Reset:</span>
          <ResetCountdown reset={resource.reset} label={`${label} reset countdown`} compact />
        </span>
      </div>
    </motion.article>
  )
}

export function ResourceGrid({ rows, history }: { rows: ResourceRow[]; history: RateLimitSnapshot[] }) {
  const [query, setQuery] = useState('')
  const [hideIdle, setHideIdle] = useState(false)
  const [sort, setSort] = useState<ResourceSort>('name')
  const visible = useMemo(() => filterRows(rows, { query, hideIdle, sort }), [rows, query, hideIdle, sort])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter resources…"
          aria-label="Filter resources"
          className="h-9 min-w-0 flex-1 rounded-xl border border-slate-300/80 bg-white/70 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-white/10 dark:bg-slate-950/60 sm:max-w-xs sm:flex-none"
        />
        <div role="group" aria-label="Sort resources" className="flex gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]">
          {(['name', 'usage'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
              className={`h-7 rounded-lg px-3 text-xs font-medium transition ${sort === value ? 'bg-white shadow dark:bg-slate-700' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {value === 'name' ? 'A–Z' : 'Most used'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input type="checkbox" checked={hideIdle} onChange={(e) => setHideIdle(e.target.checked)} className="size-4 accent-indigo-500" />
          Hide idle
        </label>
      </div>
      {visible.length === 0 ? (
        <p role="status" className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10">No resources match.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((row, i) => (
            <Card key={row.name} row={row} history={history} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
