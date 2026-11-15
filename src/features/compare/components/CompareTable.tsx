import { cn, formatRelativeTime } from '@/lib/utils'
import { ExternalLinkIcon, XIcon } from '@/components/ui/icons'
import { LanguageBar } from '@/features/repos/components/LanguageBar'
import { bestIndexes, METRICS, type ComparisonColumn, type MetricDef } from '../metrics'

const numberFormat = new Intl.NumberFormat('en')

const headCell = 'px-4 py-3 text-left align-top font-normal'
const rowHeader = 'sticky left-0 z-10 bg-white px-4 py-3 text-left text-sm font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300'

function HeaderCell({ column, onRemove }: { column: ComparisonColumn; onRemove: (username: string) => void }) {
  const { profile, profileState, profileError, username } = column
  return (
    <th scope="col" className={headCell}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {profileState === 'loading' ? (
            <div className="animate-pulse space-y-2" aria-busy="true" aria-label={`Loading ${username}`}>
              <div className="size-12 rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ) : profile ? (
            <div className="flex items-start gap-3">
              <img src={profile.avatar_url} alt="" width={48} height={48} className="size-12 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700" />
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
          className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        >
          <XIcon />
        </button>
      </div>
    </th>
  )
}

function Cell({ children, best = false }: { children: React.ReactNode; best?: boolean }) {
  return (
    <td className={cn('px-4 py-3 text-sm tabular-nums', best ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200')}>
      {children}
      {best ? (
        <>
          <span aria-hidden="true"> ▲</span>
          <span className="sr-only"> (highest)</span>
        </>
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

  return (
    <tr className="border-t border-slate-100 dark:border-slate-800" data-testid={`metric-${metric.id}`}>
      <th scope="row" className={rowHeader}>
        {metric.label}
      </th>
      {values.map((v, i) => (
        <Cell key={columns[i]?.username} best={best.includes(i)}>
          {v.state === 'loading' ? (
            <span aria-label="Loading">…</span>
          ) : v.value === null ? (
            <span aria-label="Not available">—</span>
          ) : (
            numberFormat.format(v.value)
          )}
        </Cell>
      ))}
    </tr>
  )
}

export function CompareTable({ columns, onRemove }: { columns: ComparisonColumn[]; onRemove: (username: string) => void }) {
  const anyTruncated = columns.some((c) => c.truncated)

  return (
    <div className="space-y-3">
      <div
        role="region"
        aria-label="Comparison table; scroll horizontally to see all users"
        tabIndex={0}
        className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-800 dark:bg-slate-900"
      >
        <table className="w-full min-w-[36rem] border-collapse" data-testid="compare-table">
          <caption className="sr-only">Side-by-side comparison of GitHub users</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(headCell, 'sticky left-0 z-10 bg-white text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400')}>
                Metric
              </th>
              {columns.map((column) => (
                <HeaderCell key={column.username} column={column} onRemove={onRemove} />
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => (
              <MetricRow key={metric.id} metric={metric} columns={columns} />
            ))}

            <tr className="border-t border-slate-100 dark:border-slate-800" data-testid="metric-top-languages">
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

            <tr className="border-t border-slate-100 dark:border-slate-800" data-testid="metric-joined">
              <th scope="row" className={rowHeader}>
                Member since
              </th>
              {columns.map((column) => (
                <Cell key={column.username}>{column.profile?.created_at ? new Date(column.profile.created_at).getFullYear() : '—'}</Cell>
              ))}
            </tr>

            <tr className="border-t border-slate-100 dark:border-slate-800" data-testid="metric-last-pushed">
              <th scope="row" className={rowHeader}>
                Last pushed
              </th>
              {columns.map((column) => (
                <Cell key={column.username}>
                  {column.summary?.lastPushedAt ? formatRelativeTime(new Date(column.summary.lastPushedAt)) : '—'}
                </Cell>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        ▲ marks the highest value in a row. Repository figures exclude forks and count each repository's primary language.
        {anyTruncated ? ' For users with more than 100 public repositories they cover the 100 most recently pushed.' : ''}
      </p>
    </div>
  )
}
