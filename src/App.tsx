import { motion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon, CheckIcon, CompareIcon, PlusIcon, ReportIcon, SearchIcon, SparklesIcon } from '@/components/ui/icons'
import { PageBackdrop } from '@/components/PageBackdrop'
import { SiteFooter } from '@/components/SiteFooter'
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
import { ReportCta } from '@/features/report/components/ReportCta'
import { UserMatches } from '@/features/search/components/UserMatches'

// The report pulls in charting/animation libraries, so it is only downloaded when someone opens it.
const ReportPage = lazy(() => import('@/features/report/components/ReportPage').then((m) => ({ default: m.ReportPage })))

const RateLimitDashboard = lazy(() =>
  import('@/features/rateLimit/components/RateLimitDashboard').then((module) => ({
    default: module.RateLimitDashboard,
  })),
)

function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex w-32 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors sm:w-36 sm:px-4',
        active ? 'text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
      )}
    >
      {active ? (
        <motion.span
          layoutId="main-nav-pill"
          aria-hidden="true"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 -z-0 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 shadow-md shadow-indigo-600/30"
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  )
}

const FEATURES = [
  { icon: <SearchIcon className="size-5" />, title: 'Profiles & repositories', text: 'Followers, stars, forks, languages, topics, licenses and repo age at a glance.', tint: 'from-indigo-500 to-violet-500' },
  { icon: <CompareIcon className="size-5" />, title: 'Compare side by side', text: 'Up to five developers with winners, bars and a skill radar.', tint: 'from-cyan-500 to-sky-500' },
  { icon: <ReportIcon className="size-5" />, title: '3D developer reports', text: 'Contribution heatmaps, release timelines and a dependency security radar.', tint: 'from-emerald-500 to-teal-500' },
] as const

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  return pathname === '/rate-limit' ? (
    <Suspense fallback={<div role="status" className="p-8 text-center text-sm text-slate-500">Loading analytics…</div>}>
      <RateLimitDashboard />
    </Suspense>
  ) : (
    <ExploreApp />
  )
}

function ExploreApp() {
  const [initial] = useState(() => parseUrlState(window.location.search))
  const [view, setView] = useState<View>(initial.view)
  // `query` drives the list of matching users; `selected` drives the full profile.
  const [query, setQuery] = useState<string | null>(initial.query)
  const [selected, setSelected] = useState<string | null>(
    initial.query && isValidUsername(initial.query) ? initial.query : null,
  )
  const [compareUsers, setCompareUsers] = useState<string[]>(initial.users)
  const [reportUser, setReportUser] = useState<string | null>(initial.report)
  const profile = useProfile(selected)

  // Keep the address bar in sync so views can be bookmarked and shared. Opening or leaving a report is
  // a "page change" and gets its own history entry (so the browser Back button works); everything else
  // (typing a search, editing the comparison) just rewrites the current entry.
  const previousPage = useRef({ view, report: reportUser })
  useEffect(() => {
    const url = new URL(window.location.href)
    url.search = serializeUrlState({ view, query, users: compareUsers, report: reportUser })
    const before = previousPage.current
    const pageChanged = (view === 'report') !== (before.view === 'report') || (view === 'report' && reportUser !== before.report)
    previousPage.current = { view, report: reportUser }
    if (url.href === window.location.href) return
    if (pageChanged) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }, [view, query, compareUsers, reportUser])

  // Browser Back / Forward: re-read the address bar.
  useEffect(() => {
    function onPopState() {
      const state = parseUrlState(window.location.search)
      previousPage.current = { view: state.view, report: state.report }
      setView(state.view)
      setQuery(state.query)
      setSelected(state.query && isValidUsername(state.query) ? state.query : null)
      setCompareUsers(state.users)
      setReportUser(state.report)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openReport(username: string) {
    setReportUser(username.toLowerCase())
    setView('report')
    window.scrollTo({ top: 0 })
  }

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
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-6 sm:px-6 sm:py-10 lg:px-8 xl:px-10 2xl:px-12">
      <PageBackdrop />
      <header className="relative isolate mb-6 text-center sm:mb-8">
        <div className="relative flex items-center justify-center gap-3">
          <span
            aria-hidden="true"
            title="Crafted by Hassan Rupam"
            className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 sm:size-11"
          >
            <SparklesIcon className="size-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl 2xl:text-5xl">
            Dev<span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent dark:from-indigo-300 dark:to-cyan-300">Explore</span>
          </h1>
          <ThemeToggle />
        </div>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Explore and compare public GitHub developers.</p>
        <nav aria-label="Main" className="mt-5 inline-flex gap-1 rounded-2xl border border-slate-200/80 bg-white/70 p-1.5 shadow-lg shadow-slate-900/[0.06] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-black/30">
          <NavTab active={view === 'explore' || view === 'report'} onClick={() => setView('explore')}>
            <SearchIcon />
            Explore
          </NavTab>
          <NavTab active={view === 'compare'} onClick={() => setView('compare')}>
            <CompareIcon />
            Compare{compareUsers.length > 0 ? ` (${compareUsers.length})` : ''}
          </NavTab>
        </nav>
      </header>

      <main className="flex-1 space-y-4 sm:space-y-6">
        {view === 'report' && reportUser ? (
          <Suspense fallback={<p role="status" className="py-24 text-center text-sm text-slate-500">Loading report…</p>}>
            <ReportPage username={reportUser} onBack={() => setView('explore')} />
          </Suspense>
        ) : view === 'compare' ? (
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
              <div className="mx-auto w-full max-w-3xl space-y-4">
                <p className="text-center text-sm text-slate-600 dark:text-slate-400">
                  Enter a username above to see their public profile, repositories and matching users.
                </p>
                <ul className="grid gap-3 sm:grid-cols-3">
                  {FEATURES.map((feature, i) => (
                    <motion.li
                      key={feature.title}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.08, duration: 0.5 }}
                      className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-lg shadow-slate-900/[0.04] backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-xl dark:border-white/[0.08] dark:bg-white/[0.03]"
                    >
                      <span className={cn('grid size-9 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md', feature.tint)}>{feature.icon}</span>
                      <p className="mt-3 text-sm font-semibold">{feature.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{feature.text}</p>
                    </motion.li>
                  ))}
                </ul>
              </div>
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
                    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                    <div className="min-w-0 lg:sticky lg:top-4">
                    <ProfileCard
                      profile={profile.data.profile}
                      actions={
                        <>
                          {shownLogin && profile.data.profile.type === 'User' ? <ReportCta username={shownLogin} onOpen={openReport} /> : null}
                          {shownLogin && isInComparison(shownLogin) ? (
                          <Button type="button" onClick={() => setView('compare')} className="h-10 border-emerald-500/30 bg-emerald-600 hover:bg-emerald-500">
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
                        )}
                        </>
                      }
                    />
                    </div>
                    <RepoDetails profile={profile.data.profile} />
                    </div>
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

      <SiteFooter />
    </div>
  )
}
