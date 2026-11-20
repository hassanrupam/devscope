import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { CheckIcon, ExternalLinkIcon, PlusIcon } from '@/components/ui/icons'
import { toAppError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { ErrorPanel } from '@/features/profile/components/ErrorPanel'
import { ResultStatus } from '@/features/profile/components/ResultStatus'
import type { SearchUser } from '@/services/github/schema'
import { useUserSearch } from '../useUserSearch'

interface UserMatchesProps {
  /** The submitted prefix (already normalised). */
  prefix: string
  /** Login whose full profile is currently shown, to highlight its tile. */
  selectedLogin: string | null
  onSelect: (login: string) => void
  /** Adds a user to the comparison; when omitted the tiles have no compare button. */
  onCompare?: (login: string) => void
  /** True for logins already in the comparison (button disabled). */
  isInComparison?: (login: string) => boolean
  /** True when no more users can be added. */
  comparisonFull?: boolean
}

interface UserTileProps {
  user: SearchUser
  selected: boolean
  onSelect: () => void
  compare?: { added: boolean; full: boolean; onCompare: () => void }
}

function UserTile({ user, selected, onSelect, compare, index }: UserTileProps & { index: number }) {
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      <div
        className={cn(
          'group relative flex flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden rounded-xl border p-2 pr-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:flex-nowrap',
          selected
            ? 'border-indigo-400/70 bg-gradient-to-br from-indigo-50 to-white shadow-lg shadow-indigo-500/10 dark:border-indigo-400/60 dark:from-indigo-500/15 dark:to-slate-900/70'
            : 'border-slate-200/80 bg-white/70 hover:border-indigo-300 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-indigo-400/40 dark:hover:bg-white/[0.06]',
        )}
      >
        {selected ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" /> : null}
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
          aria-label={`View profile of ${user.login}`}
          className="flex min-w-0 flex-1 basis-40 items-center gap-3 rounded-lg p-1 text-left"
        >
          <img
            src={user.avatar_url}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white shadow-md dark:ring-slate-800"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{user.login}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">GitHub {user.type.toLowerCase()}</span>
          </span>
          {user.type !== 'User' ? <Badge>{user.type}</Badge> : null}
        </button>
        <a
          href={user.html_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${user.login} on GitHub`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          GitHub <ExternalLinkIcon />
        </a>
        {compare ? (
          <button
            type="button"
            onClick={compare.onCompare}
            disabled={compare.added || compare.full}
            aria-label={compare.added ? `${user.login} is in the comparison` : `Add ${user.login} to compare`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300/80 bg-white/60 px-2 py-1 text-xs font-medium shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30"
          >
            {compare.added ? (
              <>
                <CheckIcon />
                Added
              </>
            ) : (
              <>
                <PlusIcon />
                Compare
              </>
            )}
          </button>
        ) : null}
      </div>
    </motion.li>
  )
}

function ListSkeleton() {
  return (
    <ul className="animate-pulse space-y-2" aria-busy="true" aria-label="Loading matching users">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/50 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
        </li>
      ))}
    </ul>
  )
}

export function UserMatches({ prefix, selectedLogin, onSelect, onCompare, isInComparison, comparisonFull }: UserMatchesProps) {
  const { data, error, isFetching } = useUserSearch(prefix)

  return (
    <section aria-labelledby="matches-heading" className="space-y-3" aria-live="polite">
      <h2 id="matches-heading" className="flex items-center gap-2.5 text-base font-bold tracking-tight sm:text-lg">
        <span aria-hidden="true" className="h-5 w-1 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
        Users starting with “{prefix}”
      </h2>

      {isFetching ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorPanel error={toAppError(error)} />
      ) : data ? (
        <>
          <ResultStatus result={data} testId="search-status" />
          {data.users.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300/80 bg-white/50 p-6 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400">
              No users found whose username starts with “{prefix}”.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3" data-testid="user-list">
              {data.users.map((user, index) => (
                <UserTile
                  index={index}
                  key={user.id}
                  user={user}
                  selected={selectedLogin?.toLowerCase() === user.login.toLowerCase()}
                  onSelect={() => onSelect(user.login)}
                  compare={
                    onCompare
                      ? {
                          added: isInComparison?.(user.login) ?? false,
                          full: comparisonFull ?? false,
                          onCompare: () => onCompare(user.login),
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shows the most-followed matches. GitHub search results include only username, avatar and account type;
            select a user for the full profile.
          </p>
        </>
      ) : null}
    </section>
  )
}
