import { useState } from 'react'
import { toAppError } from '@/lib/errors'
import { isValidUsername, parsePrefix } from '@/lib/username'
import { ErrorPanel } from '@/features/profile/components/ErrorPanel'
import { ProfileCard } from '@/features/profile/components/ProfileCard'
import { ProfileSkeleton } from '@/features/profile/components/ProfileSkeleton'
import { ResultStatus } from '@/features/profile/components/ResultStatus'
import { SearchForm } from '@/features/profile/components/SearchForm'
import { useProfile } from '@/features/profile/useProfile'
import { UserMatches } from '@/features/search/components/UserMatches'

function readInitialQuery(): string | null {
  const value = new URLSearchParams(window.location.search).get('u')
  if (!value) return null
  try {
    return parsePrefix(value)
  } catch {
    return null
  }
}

export default function App() {
  const [initialQuery] = useState(readInitialQuery)
  // `query` drives the list of matching users; `selected` drives the full profile.
  const [query, setQuery] = useState<string | null>(initialQuery)
  const [selected, setSelected] = useState<string | null>(
    initialQuery && isValidUsername(initialQuery) ? initialQuery : null,
  )
  const profile = useProfile(selected)

  function handleSearch(text: string) {
    setQuery(text)
    // An exact profile lookup only makes sense for a complete, valid username.
    setSelected(isValidUsername(text) ? text : null)
    const url = new URL(window.location.href)
    url.searchParams.set('u', text)
    window.history.replaceState(null, '', url)
  }

  const profileError = profile.error ? toAppError(profile.error) : null

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-10 sm:py-16">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Dev<span className="text-indigo-600 dark:text-indigo-400">Explore</span>
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Look up any public GitHub developer profile.</p>
      </header>

      <main className="flex-1 space-y-8">
        <SearchForm initialValue={initialQuery ?? ''} isLoading={profile.isFetching} onSearch={handleSearch} />

        {query === null ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Enter a username above to see their public profile and matching users.
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
                <ProfileCard profile={profile.data.profile} />
              </>
            ) : null}
          </section>
        ) : null}

        {query !== null ? <UserMatches prefix={query} selectedLogin={selected} onSelect={setSelected} /> : null}
      </main>

      <footer className="mt-12 text-center text-xs text-slate-500 dark:text-slate-500">
        Public data from the GitHub API. Profiles and searches are cached for a few days to stay within GitHub rate limits.
      </footer>
    </div>
  )
}
