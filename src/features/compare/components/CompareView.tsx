import { motion } from 'framer-motion'
import { lazy, Suspense, useState, type FormEvent } from 'react'
import { CrownIcon, PlusIcon, SearchIcon, SparklesIcon, TrashIcon, XIcon } from '@/components/ui/icons'
import { config } from '@/config'
import { ReportCard } from '@/features/report/components/ReportCard'
import { isAppError } from '@/lib/errors'
import { formatCount } from '@/lib/utils'
import { parseUsername } from '@/lib/username'
import { userColor } from '../colors'
import { sharedLanguages, winCounts, type ComparisonColumn } from '../metrics'
import { useComparison } from '../useComparison'
import { CompareTable } from './CompareTable'

const CompareRadar = lazy(() => import('./CompareRadar'))

interface CompareViewProps {
  users: string[]
  /** Returns an error message when the user cannot be added, otherwise null. */
  onAdd: (username: string) => string | null
  onClear: () => void
  onRemove: (username: string) => void
}

/** "@a has 4× more followers than @b" style facts, only where the gap is real. */
function gapFacts(columns: ComparisonColumn[]): string[] {
  const facts: string[] = []
  const pairs: Array<[string, (c: ComparisonColumn) => number | null]> = [
    ['followers', (c) => c.profile?.followers ?? null],
    ['stars', (c) => c.summary?.totalStars ?? null],
    ['repositories', (c) => c.summary?.originalRepos ?? null],
  ]
  for (const [label, pick] of pairs) {
    const ranked = columns.flatMap((c) => {
      const v = pick(c)
      return v === null ? [] : [{ u: c.username, v }]
    }).sort((a, b) => b.v - a.v)
    const [top, second] = ranked
    if (top && second && second.v > 0 && top.v / second.v >= 1.5) {
      facts.push(`@${top.u} has ${top.v / second.v >= 10 ? Math.round(top.v / second.v) : (top.v / second.v).toFixed(1)}× the ${label} of @${second.u}.`)
    }
  }
  return facts
}

function Contender({ column, index, wins, contested, leader }: { column: ComparisonColumn; index: number; wins: number; contested: number; leader: boolean }) {
  const color = userColor(index)
  const { profile } = column
  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-lg shadow-slate-900/[0.04] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gradient-to-b dark:from-slate-900/80 dark:to-slate-950/80"
      style={leader ? { boxShadow: `0 0 0 1px ${color}66, 0 12px 40px -12px ${color}55` } : undefined}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex items-center gap-3">
        {profile ? (
          <img src={profile.avatar_url} alt="" width={56} height={56} className="size-14 shrink-0 rounded-full object-cover ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900" style={{ ['--tw-ring-color' as string]: color }} />
        ) : (
          <span className="size-14 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-semibold">
            <span className="truncate">{profile?.name ?? profile?.login ?? column.username}</span>
            {leader ? <CrownIcon className="size-4 shrink-0 text-amber-400" /> : null}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{column.username}</p>
        </div>
      </div>
      <p className="mt-3 text-sm">
        {contested > 0 ? (
          <>
            <span className="text-2xl font-bold tabular-nums" style={{ color }}>{wins}</span>
            <span className="text-slate-500 dark:text-slate-400"> of {contested} metrics led</span>
          </>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Waiting for data…</span>
        )}
      </p>
      {contested > 0 ? (
        <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--r-track)' }}>
          <motion.span initial={{ width: 0 }} animate={{ width: `${(wins / contested) * 100}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} className="block h-full rounded-full" style={{ background: color }} />
        </span>
      ) : null}
      {profile ? (
        <p className="mt-3 grid grid-cols-3 gap-1 text-center text-[0.65rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {[['Followers', profile.followers], ['Repos', profile.public_repos], ['Stars', column.summary?.totalStars ?? null]].map(([label, value]) => (
            <span key={label as string} className="rounded-lg bg-slate-100/80 px-1 py-1.5 dark:bg-white/[0.04]">
              <span className="block text-sm font-bold normal-case tabular-nums text-slate-900 dark:text-slate-100">{value === null ? '…' : formatCount(value as number)}</span>
              {label}
            </span>
          ))}
        </p>
      ) : null}
    </motion.li>
  )
}

export function CompareView({ users, onAdd, onClear, onRemove }: CompareViewProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const columns = useComparison(users)
  const full = users.length >= config.maxCompareUsers

  function clearInput() {
    setValue('')
    setError(null)
  }

  function clearComparison() {
    clearInput()
    onClear()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const username = parseUsername(value)
      const problem = onAdd(username)
      setError(problem)
      if (!problem) setValue('')
    } catch (err) {
      setError(isAppError(err) ? err.message : 'Enter a valid GitHub username.')
    }
  }

  const { wins, contested } = winCounts(columns)
  const topWins = Math.max(0, ...wins)
  const leaders = wins.flatMap((w, i) => (w === topWins && topWins > 0 ? [i] : []))
  const shared = sharedLanguages(columns)
  const facts = gapFacts(columns)
  const ready = columns.filter((c) => c.profile)

  return (
    <div className="space-y-4">
      <motion.form
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={handleSubmit}
        noValidate
        aria-label="Add a user to the comparison"
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-xl shadow-slate-900/[0.05] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gradient-to-b dark:from-slate-900/80 dark:to-slate-950/80 dark:shadow-black/40 sm:p-5"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="compare-username" className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Add a GitHub username to compare
          </label>
          <span className="flex items-center gap-1" role="img" aria-label={`${users.length} of ${config.maxCompareUsers} slots used`}>
            {Array.from({ length: config.maxCompareUsers }, (_, i) => (
              <span key={i} className="size-2 rounded-full transition-colors" style={{ background: i < users.length ? userColor(i) : 'var(--r-track)' }} />
            ))}
          </span>
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="group relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
            <input
              id="compare-username"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={full ? `Comparison is full (${config.maxCompareUsers} users)` : 'e.g. gaearon'}
              disabled={full}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'compare-error' : 'compare-hint'}
              className="h-12 w-full rounded-xl border border-slate-300/80 bg-white/80 pl-11 pr-11 text-base text-slate-900 shadow-inner shadow-slate-900/[0.03] transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 disabled:opacity-60 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-indigo-400"
            />
            {value ? (
              <button
                type="button"
                onClick={clearInput}
                aria-label="Clear comparison username"
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <XIcon />
              </button>
            ) : null}
          </div>
          <div className="flex gap-2.5">
            <button
              type="submit"
              disabled={full}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/35 disabled:translate-y-0 disabled:opacity-60 sm:flex-none"
            >
              <PlusIcon />
              Add user
            </button>
            {users.length > 0 ? (
              <button
                type="button"
                onClick={clearComparison}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
              >
                <TrashIcon />
                Clear comparison
              </button>
            ) : null}
          </div>
        </div>
        <p id="compare-hint" className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Compare 2 to {config.maxCompareUsers} users. You can also add users with “Add to compare” from the Explore tab.
        </p>
        {error ? (
          <p id="compare-error" role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </motion.form>

      {users.length < 2 ? (
        <div className="rounded-2xl border border-dashed border-slate-300/80 bg-white/50 p-8 text-center backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.02]">
          <CompareGlyph />
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {users.length === 0
              ? 'Add at least two users to see them side by side.'
              : `Added @${users[0]}. Add one more user to start comparing.`}
          </p>
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]" aria-label="Head to head">
            {columns.map((column, i) => (
              <Contender key={column.username} column={column} index={i} wins={wins[i] ?? 0} contested={contested} leader={leaders.length === 1 && leaders[0] === i} />
            ))}
          </ul>

          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ReportCard title="Skill radar" subtitle="Each axis is scaled to the leader" index={1} testId="compare-radar">
              {ready.length >= 2 ? (
                <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-slate-200/60 dark:bg-white/[0.04] sm:h-80" aria-busy="true" />}>
                  <CompareRadar columns={columns} />
                </Suspense>
              ) : (
                <div className="grid h-72 place-items-center text-sm text-slate-500 sm:h-80">Loading profiles…</div>
              )}
              <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400" aria-label="Legend">
                {columns.map((c, i) => (
                  <li key={c.username} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: userColor(i) }} />@{c.username}
                  </li>
                ))}
              </ul>
            </ReportCard>

            <ReportCard title="Insights" subtitle="What stands out" index={2} testId="compare-insights">
              <ul className="space-y-3 text-sm">
                {leaders.length > 0 ? (
                  <li className="flex gap-2.5">
                    <CrownIcon className="mt-0.5 size-4 shrink-0 text-amber-400" />
                    <span>
                      {leaders.length === 1 ? (
                        <>
                          <strong>@{columns[leaders[0] ?? 0]?.username}</strong> leads in {topWins} of {contested} contested metrics.
                        </>
                      ) : (
                        <>It&apos;s a tie: {leaders.map((i) => `@${columns[i]?.username}`).join(' and ')} each lead {topWins} metrics.</>
                      )}
                    </span>
                  </li>
                ) : null}
                {facts.map((fact) => (
                  <li key={fact} className="flex gap-2.5">
                    <SparklesIcon className="mt-0.5 size-4 shrink-0 text-violet-500" />
                    <span>{fact}</span>
                  </li>
                ))}
                <li className="flex gap-2.5">
                  <SearchIcon className="mt-0.5 size-4 shrink-0 text-cyan-500" />
                  <span>
                    {shared.length > 0 ? (
                      <>
                        Shared languages:{' '}
                        {shared.map((lang) => (
                          <span key={lang} className="mr-1 inline-block rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-700 dark:text-cyan-300">
                            {lang}
                          </span>
                        ))}
                      </>
                    ) : (
                      'No language is shared by every user yet.'
                    )}
                  </span>
                </li>
              </ul>
            </ReportCard>
          </div>

          <CompareTable columns={columns} onRemove={onRemove} />
        </>
      )}
    </div>
  )
}

function CompareGlyph() {
  return (
    <div className="mx-auto flex w-fit items-center gap-2" aria-hidden="true">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.4, ease: 'easeInOut' }}
          className="grid size-12 place-items-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 dark:border-white/15"
        >
          <PlusIcon className="size-5" />
        </motion.span>
      ))}
    </div>
  )
}
