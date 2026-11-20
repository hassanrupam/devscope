import { Fragment } from 'react'
import { motion } from 'framer-motion'
import { cn, formatRelativeTime } from '@/lib/utils'
import { ExternalLinkIcon, XIcon } from '@/components/ui/icons'
import { LanguageBar } from '@/features/repos/components/LanguageBar'
import { userColor } from '../colors'
import { bestIndexes, METRIC_GROUPS, METRICS, type ComparisonColumn, type MetricDef } from '../metrics'

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

const headCell = 'px-4 py-3 text-left align-top font-normal'
const rowHeader = 'sticky left-0 z-10 bg-white/95 px-4 py-3 text-left text-sm font-medium text-slate-600 dark:bg-slate-900/95 dark:text-slate-300'
const rowClass = 'border-t border-slate-100 transition-colors hover:bg-indigo-50/40 dark:border-white/[0.06] dark:hover:bg-white/[0.03]'

function HeaderCell({ column, index, onRemove }: { column: ComparisonColumn; index: number; onRemove: (username: string) => void }) {
  const { profile, profileState, profileError, username } = column
  const color = userColor(index)
  return (
    <th scope="col" className={cn(headCell, 'min-w-44')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {profileState === 'loading' ? (
            <div className="animate-pulse space-y-2" aria-busy="true" aria-label={`Loading ${username}`}>
              <div className="size-12 rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ) : profile ? (
            <div className="flex items-start gap-3">
              <img src={profile.avatar_url} alt="" width={48} height={48} className="size-12 shrink-0 rounded-full object-cover ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900" style={{ ['--tw-ring-color' as string]: color }} />
              <div className="min-w-0">
                <p className="break-words font-semibold text-slate-900 dark:text-slate-100">{profile.name ?? profile.login}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">@{profile.login}</p>
                <a href={profile.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                  GitHub <ExternalLinkIcon />
                </a>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">@{username}</p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{profileError?.message ?? 'Could not load this user.'}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(username)}
          aria-label={`Remove ${username} from comparison`}
          className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        >
          <XIcon />
        </button>
      </div>
      <span aria-hidden="true" className="mt-3 block h-0.5 rounded-full" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
    </th>
  )
}

function Cell({ children, best = false, ratio, color }: { children: React.ReactNode; best?: boolean; ratio?: number; color?: string }) {
  return (
    <td className={cn('px-4 py-3 align-middle text-sm tabular-nums', best ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200')}>
      <span>
        {children}
        {best ? (
          <>
            <span aria-hidden="true"> ▲</span>
            <span className="sr-only"> (highest)</span>
          </>
        ) : null}
      </span>
      {ratio !== undefined && color ? (
        <span aria-hidden="true" className="mt-1.5 block h-1 overflow-hidden rounded-full" style={{ background: 'var(--r-track)' }}>
          <motion.span
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(ratio * 100, ratio > 0 ? 3 : 0)}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="block h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${color}99, ${color})` }}
          />
        </span>
      ) : null}
    </td>
  )
}

function MetricRow({ metric, columns }: { metric: MetricDef; columns: ComparisonColumn[] }) {
  const values = columns.map((column) => {
    const state = metric.source === 'profile' ? column.profileState : column.repoState
    return { state, value: state === 'ready' ? metric.value(column) : null }
  })
  const best = metric.higherIsBetter ? bestIndexes(values.map((v) => v.value)) : []
  const max = Math.max(0, ...values.map((v) => v.value ?? 0))

  return (
    <tr className={rowClass} data-testid={`metric-${metric.id}`}>
      <th scope="row" className={rowHeader}>
        {metric.label}
      </th>
      {values.map((v, i) => (
        <Cell key={columns[i]?.username} best={best.includes(i)} ratio={v.value !== null && max > 0 ? v.value / max : undefined} color={userColor(i)}>
          {v.state === 'loading' ? (
            <span aria-label="Loading">…</span>
          ) : v.value === null ? (
            <span aria-label="Not available">—</span>
          ) : (
            <>
              {numberFormat.format(v.value)}
              {metric.unit ? <span className="ml-1 text-xs font-normal text-slate-500">{metric.unit}</span> : null}
            </>
          )}
        </Cell>
      ))}
    </tr>
  )
}

export function CompareTable({ columns, onRemove }: { columns: ComparisonColumn[]; onRemove: (username: string) => void }) {
  const anyTruncated = columns.some((c) => c.truncated)
  const colSpan = columns.length + 1

  return (
    <div className="space-y-3">
      <div
        role="region"
        aria-label="Comparison table; scroll horizontally to see all users"
        tabIndex={0}
        className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-900/[0.05] backdrop-blur-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-white/[0.08] dark:bg-gradient-to-b dark:from-slate-900/80 dark:to-slate-950/80 dark:shadow-black/40"
      >
        <table className="w-full min-w-[36rem] border-collapse" data-testid="compare-table">
          <caption className="sr-only">Side-by-side comparison of GitHub users</caption>
          <thead>
            <tr className="bg-slate-50/70 dark:bg-white/[0.03]">
              <th scope="col" className={cn(headCell, 'sticky left-0 z-10 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/95 dark:text-slate-400')}>
                Metric
              </th>
              {columns.map((column, i) => (
                <HeaderCell key={column.username} column={column} index={i} onRemove={onRemove} />
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_GROUPS.map((group) => (
              <Fragment key={group}>
                <tr className="bg-slate-50/60 dark:bg-white/[0.025]">
                  <th colSpan={colSpan} scope="colgroup" className="px-4 py-1.5 text-left text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
                    {group}
                  </th>
                </tr>
                {METRICS.filter((m) => m.group === group).map((metric) => (
                  <MetricRow key={metric.id} metric={metric} columns={columns} />
                ))}
                {group === 'Repositories' ? (
                  <tr className={rowClass} data-testid="metric-top-languages">
                    <th scope="row" className={rowHeader}>
                      Top languages
                    </th>
                    {columns.map((column) => (
                      <td key={column.username} className="min-w-44 px-4 py-3 align-top text-sm">
                        {column.repoState === 'loading' ? (
                          <span aria-label="Loading">…</span>
                        ) : column.summary ? (
                          <LanguageBar languages={column.summary.languages} max={3} />
                        ) : (
                          <span aria-label="Not available">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ) : null}
                {group === 'Activity' ? (
                  <>
                    <tr className={rowClass} data-testid="metric-joined">
                      <th scope="row" className={rowHeader}>
                        Member since
                      </th>
                      {columns.map((column) => (
                        <Cell key={column.username}>{column.profile?.created_at ? new Date(column.profile.created_at).getFullYear() : '—'}</Cell>
                      ))}
                    </tr>
                    <tr className={rowClass} data-testid="metric-last-pushed">
                      <th scope="row" className={rowHeader}>
                        Last pushed
                      </th>
                      {columns.map((column) => (
                        <Cell key={column.username}>{column.summary?.lastPushedAt ? formatRelativeTime(new Date(column.summary.lastPushedAt)) : '—'}</Cell>
                      ))}
                    </tr>
                  </>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        ▲ marks the highest value in a row; bars are scaled to the leader of each row. Repository figures exclude forks and count each repository's primary language.
        {anyTruncated ? ' For users with more than 100 public repositories they cover the 100 most recently pushed.' : ''}
      </p>
    </div>
  )
}
