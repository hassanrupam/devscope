import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { InsightPackage, ProjectInsights } from '@/services/github/schema'

type Filter = 'all' | 'outdated' | 'alerts'

const STATUS = {
  current: { label: 'Up-to-date', color: '#10b981', chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  outdated: { label: 'Outdated', color: '#f59e0b', chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  advisory: { label: 'Advisory', color: '#f43f5e', chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
} as const

const R = 42
const C = 2 * Math.PI * R

export function summarizeStack(packages: InsightPackage[]) {
  const total = packages.length
  const count = { current: 0, outdated: 0, advisory: 0 }
  for (const p of packages) count[p.status]++
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  return { total, count, pct }
}

function Donut({ count, total }: { count: ReturnType<typeof summarizeStack>['count']; total: number }) {
  const order = ['current', 'outdated', 'advisory'] as const
  let offset = 0
  return (
    <div className="relative size-36 shrink-0 sm:size-40">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${total} packages: ${count.current} up to date, ${count.outdated} outdated, ${count.advisory} with security advisories`} className="size-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--r-track)" strokeWidth="9" />
        {total > 0 &&
          order.map((key) => {
            const len = (count[key] / total) * C
            const seg = (
              <motion.circle
                key={key}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={STATUS[key].color}
                strokeWidth="9"
                strokeLinecap="butt"
                initial={{ strokeDasharray: `0 ${C}` }}
                animate={{ strokeDasharray: `${Math.max(0, len - (count[key] === total ? 0 : 1.5))} ${C}` }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                style={{ strokeDashoffset: -offset, filter: `drop-shadow(0 0 3px ${STATUS[key].color}88)` }}
              />
            )
            offset += len
            return count[key] > 0 ? seg : null
          })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-bold tabular-nums">{total}</p>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Packages</p>
        </div>
      </div>
    </div>
  )
}

export function TechRadar({ stack }: { stack: ProjectInsights['stack'] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const summary = useMemo(() => summarizeStack(stack.packages), [stack.packages])
  const visible = useMemo(
    () =>
      stack.packages
        .filter((p) => (filter === 'all' ? true : filter === 'outdated' ? p.status === 'outdated' : p.status === 'advisory'))
        .sort((a, b) => ({ advisory: 0, outdated: 1, current: 2 })[a.status] - ({ advisory: 0, outdated: 1, current: 2 })[b.status] || a.name.localeCompare(b.name)),
    [stack.packages, filter],
  )

  return (
    <div className="min-w-0 space-y-3">
      {stack.manifests.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Detected manifests">
          {stack.manifests.map((m) => (
            <li key={`${m.repo}/${m.file}`} title={m.repo} className="max-w-full truncate rounded-lg border border-slate-200/80 bg-white/60 px-2 py-0.5 text-xs dark:border-white/10 dark:bg-white/[0.04]">
              <span className="font-mono font-semibold">{m.file}</span> <span className="text-slate-500">({m.label})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="rounded-xl border border-dashed border-slate-300/80 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700/80">
          No dependency manifests found in the root of this user&apos;s recent repositories.
        </p>
      )}

      {summary.total > 0 ? (
        <>
          <div className="flex flex-col items-center gap-5 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-black/20 sm:flex-row sm:justify-around sm:p-4">
            <Donut count={summary.count} total={summary.total} />
            <ul className="w-full min-w-0 max-w-xs space-y-2 text-sm">
              {(['current', 'outdated', 'advisory'] as const).map((key) => (
                <li key={key} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: STATUS[key].color }} />
                  <span className="min-w-0 flex-1 truncate">{key === 'outdated' ? 'Minor / Major Outdated' : key === 'advisory' ? 'Security Advisory' : 'Up-to-date'}</span>
                  <span className="font-mono text-xs tabular-nums" style={{ color: STATUS[key].color }}>
                    {summary.count[key]} ({summary.pct(summary.count[key])}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div role="group" aria-label="Filter packages" className="flex w-fit gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]">
            {([['all', 'All'], ['outdated', 'Outdated'], ['alerts', 'Alerts']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn('h-7 rounded-lg px-3 text-xs font-medium transition', filter === value ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="max-h-72 min-w-0 space-y-2 overflow-y-auto overflow-x-hidden pr-1" aria-label="Packages">
            {visible.length === 0 ? (
              <li role="status" className="py-6 text-center text-sm text-slate-500">
                {filter === 'alerts' ? 'No known security advisories — nice.' : 'Nothing to show for this filter.'}
              </li>
            ) : (
              visible.map((p, i) => (
                <motion.li
                  key={`${p.ecosystem}:${p.name}:${p.repo}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.03 }}
                  className="min-w-0 rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all text-sm">
                        <span className="font-mono font-semibold">{p.name}</span> <span className="text-[0.7rem] text-slate-500">{p.repo}</span>
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                        Declared: {p.installed} → Latest: <span className="text-cyan-600 dark:text-cyan-300">{p.latest ?? 'unknown'}</span>
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-md border px-2 py-0.5 text-[0.68rem] font-semibold', STATUS[p.status].chip)}>{STATUS[p.status].label}</span>
                  </div>
                  {p.advisory ? (
                    <p className="mt-1.5 break-words text-xs text-rose-700 [overflow-wrap:anywhere] dark:text-rose-300">
                      <span className="font-semibold uppercase">{p.advisory.severity}</span> · {p.advisory.summary}{' '}
                      <a href={p.advisory.url} target="_blank" rel="noreferrer" className="underline">{p.advisory.id}</a>
                    </p>
                  ) : null}
                </motion.li>
              ))
            )}
          </ul>
        </>
      ) : null}
    </div>
  )
}
