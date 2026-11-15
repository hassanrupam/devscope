import { Card } from '@/components/ui/card'
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

function UserTile({ user, selected, onSelect, compare }: UserTileProps) {
  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border p-2 pr-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
          selected
            ? 'border-indigo-300 bg-gradient-to-br from-indigo-50 to-white shadow-indigo-950/[0.06] dark:border-indigo-500/70 dark:from-indigo-950/60 dark:to-slate-900'
            : 'border-slate-200/80 bg-white/75 hover:border-indigo-200 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-indigo-900 dark:hover:bg-slate-900',
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
          aria-label={`View profile of ${user.login}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left"
        >
          <img
            src={user.avatar_url}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="size-10 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700"
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
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul className="animate-pulse space-y-2" aria-busy="true" aria-label="Loading matching users">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
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
      <h2 id="matches-heading" className="text-lg font-semibold">
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
            <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No users found whose username starts with “{prefix}”.
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3" data-testid="user-list">
              {data.users.map((user) => (
                <UserTile
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
