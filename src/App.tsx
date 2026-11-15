import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon, CheckIcon, CompareIcon, PlusIcon, SearchIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/ThemeToggle'
import { config } from '@/config'
import { toAppError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { parseUrlState, serializeUrlState, type View } from '@/lib/urlState'
import { isValidUsername, parseUsername } from '@/lib/username'
import { CompareView } from '@/features/compare/components/CompareView'
import { ErrorPanel } from '@/features/profile/components/ErrorPanel'
import { ProfileCard } from '@/features/profile/components/ProfileCard'
import { ProfileSkeleton } from '@/features/profile/components/ProfileSkeleton'
import { ResultStatus } from '@/features/profile/components/ResultStatus'
import { SearchForm } from '@/features/profile/components/SearchForm'
import { useProfile } from '@/features/profile/useProfile'
import { RepoDetails } from '@/features/repos/components/RepoDetails'
import { UserMatches } from '@/features/search/components/UserMatches'

function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex w-36 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-indigo-600 text-white'
          : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {children}
    </button>
  )
}

export default function App() {
  const [initial] = useState(() => parseUrlState(window.location.search))
  const [view, setView] = useState<View>(initial.view)
  // `query` drives the list of matching users; `selected` drives the full profile.
  const [query, setQuery] = useState<string | null>(initial.query)
  const [selected, setSelected] = useState<string | null>(
    initial.query && isValidUsername(initial.query) ? initial.query : null,
  )
  const [compareUsers, setCompareUsers] = useState<string[]>(initial.users)
  const profile = useProfile(selected)

  // Keep the address bar in sync so views can be bookmarked and shared.
  useEffect(() => {
    const search = serializeUrlState({ view, query, users: compareUsers })
    const url = new URL(window.location.href)
    url.search = search
    window.history.replaceState(null, '', url)
  }, [view, query, compareUsers])

  function handleSearch(text: string) {
    setQuery(text)
    // An exact profile lookup only makes sense for a complete, valid username.
    setSelected(isValidUsername(text) ? text : null)
  }

  function handleClearSearch() {
    setQuery(null)
    setSelected(null)
  }

  const comparisonFull = compareUsers.length >= config.maxCompareUsers
  const isInComparison = (login: string) => compareUsers.includes(login.toLowerCase())

  /** Returns a message when the user cannot be added, otherwise null. */
  function addToComparison(raw: string): string | null {
    let username: string
    try {
      username = parseUsername(raw)
    } catch {
      return 'That is not a valid GitHub username.'
    }
    if (compareUsers.includes(username)) return `@${username} is already in the comparison.`
    if (compareUsers.length >= config.maxCompareUsers) {
      return `You can compare up to ${config.maxCompareUsers} users. Remove one first.`
    }
    setCompareUsers([...compareUsers, username])
    return null
  }

  function removeFromComparison(username: string) {
    setCompareUsers(compareUsers.filter((u) => u !== username))
  }

  function clearComparison() {
    setCompareUsers([])
  }

  const profileError = profile.error ? toAppError(profile.error) : null
  const shownLogin = profile.data?.profile.login ?? null

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-10 sm:py-16">
      <header className="mb-8 text-center">
        <div className="relative flex items-center justify-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            Dev<span className="text-indigo-600 dark:text-indigo-400">Explore</span>
          </h1>
          <ThemeToggle />
        </div>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Explore and compare public GitHub developers.</p>
        <nav aria-label="Main" className="mt-5 inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
          <NavTab active={view === 'explore'} onClick={() => setView('explore')}>
            <SearchIcon />
            Explore
          </NavTab>
          <NavTab active={view === 'compare'} onClick={() => setView('compare')}>
            <CompareIcon />
            Compare{compareUsers.length > 0 ? ` (${compareUsers.length})` : ''}
          </NavTab>
        </nav>
      </header>

      <main className="flex-1 space-y-8">
        {view === 'compare' ? (
          <CompareView users={compareUsers} onAdd={addToComparison} onClear={clearComparison} onRemove={removeFromComparison} />
        ) : (
          <>
            <SearchForm
              initialValue={initial.query ?? ''}
              hasSearch={query !== null}
              isLoading={profile.isFetching}
              onSearch={handleSearch}
              onClear={handleClearSearch}
            />

            {query === null ? (
              <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Enter a username above to see their public profile, repositories and matching users.
              </p>
            ) : null}

            {selected !== null ? (
              <section aria-live="polite" className="space-y-4">
                {profile.isFetching ? (
                  <ProfileSkeleton />
                ) : profileError?.code === 'not_found' ? (
                  // Common while typing a prefix, so this is a quiet note rather than an error panel.
                  <p role="status" className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                    {profileError.message} Pick one of the matching users below, if any.
                  </p>
                ) : profileError ? (
                  <ErrorPanel error={profileError} />
                ) : profile.data ? (
                  <>
                    <ResultStatus result={profile.data} />
                    <ProfileCard
                      profile={profile.data.profile}
                      actions={
                        shownLogin && isInComparison(shownLogin) ? (
                          <Button type="button" onClick={() => setView('compare')} className="h-10 bg-emerald-600 hover:bg-emerald-500">
                            <CheckIcon />
                            In comparison
                            <ArrowRightIcon />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => shownLogin && addToComparison(shownLogin)}
                            disabled={comparisonFull}
                            className="h-10"
                          >
                            {comparisonFull ? (
                              <>
                                <CompareIcon />
                                {`Comparison full (${config.maxCompareUsers})`}
                              </>
                            ) : (
                              <>
                                <PlusIcon />
                                Add to compare
                              </>
                            )}
                          </Button>
                        )
                      }
                    />
                    <RepoDetails profile={profile.data.profile} />
                  </>
                ) : null}
              </section>
            ) : null}

            {query !== null ? (
              <UserMatches
                prefix={query}
                selectedLogin={selected}
                onSelect={setSelected}
                onCompare={addToComparison}
                isInComparison={isInComparison}
                comparisonFull={comparisonFull}
              />
            ) : null}
          </>
        )}
      </main>

      <footer className="mt-12 text-center text-xs text-slate-500">
        Public data from the GitHub API. Profiles, repositories and searches are cached for a few days to stay within
        GitHub rate limits.
      </footer>
    </div>
  )
}
