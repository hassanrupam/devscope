import { Card } from '@/components/ui/card'
import { toAppError } from '@/lib/errors'
import { formatCount, formatRelativeTime } from '@/lib/utils'
import { ResultStatus } from '@/features/profile/components/ResultStatus'
import type { GitHubProfile, Repo } from '@/services/github/schema'
import { isTruncated, summarizeRepos } from '../summarize'
import { useRepos } from '../useRepos'
import { LanguageBar } from './LanguageBar'

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 text-center dark:bg-slate-800/60">
      <dd className="text-xl font-semibold tabular-nums">{formatCount(value)}</dd>
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
    </div>
  )
}

function RepoRow({ repo }: { repo: Repo }) {
  return (
    <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <a
          href={repo.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 break-words font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {repo.name}
        </a>
        <span className="shrink-0 text-sm tabular-nums text-slate-600 dark:text-slate-300" aria-label={`${repo.stargazers_count} stars`}>
          ★ {formatCount(repo.stargazers_count)}
        </span>
      </div>
      {repo.description ? <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-400">{repo.description}</p> : null}
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {repo.language ? <span>{repo.language}</span> : null}
        <span>{formatCount(repo.forks_count)} forks</span>
        {repo.archived ? <span>Archived</span> : null}
        {repo.pushed_at ? <span>Pushed {formatRelativeTime(new Date(repo.pushed_at))}</span> : null}
      </p>
    </li>
  )
}

/** Repository-based details for a profile: totals, language mix and top repositories. */
export function RepoDetails({ profile }: { profile: GitHubProfile }) {
  const { data, error, isFetching } = useRepos(profile.login)

  return (
    <Card className="p-4 sm:p-6 lg:p-8" aria-labelledby="repo-details-heading">
      <h2 id="repo-details-heading" className="text-lg font-semibold">
        Repositories &amp; languages
      </h2>

      {isFetching ? (
        <div className="mt-4 animate-pulse space-y-3" aria-busy="true" aria-label="Loading repositories">
          <div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-20 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p role="status" className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Repository details are unavailable right now. {toAppError(error).message}
        </p>
      ) : data ? (
        <RepoDetailsBody profile={profile} result={data} />
      ) : null}
    </Card>
  )
}

function RepoDetailsBody({ profile, result }: { profile: GitHubProfile; result: NonNullable<ReturnType<typeof useRepos>['data']> }) {
  const summary = summarizeRepos(result.repos)
  const truncated = isTruncated(profile.public_repos, result.repos.length)

  return (
    <div className="mt-3 space-y-5">
      <ResultStatus result={result} testId="repos-status" />

      <dl className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="repo-totals">
        <Tile label="Stars" value={summary.totalStars} />
        <Tile label="Forks" value={summary.totalForks} />
        <Tile label="Own repos" value={summary.originalRepos} />
      </dl>

      <section aria-labelledby="languages-heading">
        <h3 id="languages-heading" className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          Languages
        </h3>
        <LanguageBar languages={summary.languages} />
      </section>

      <section aria-labelledby="top-repos-heading">
        <h3 id="top-repos-heading" className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          Most-starred repositories
        </h3>
        {summary.topRepos.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No original public repositories.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2" data-testid="top-repos">
            {summary.topRepos.map((repo) => (
              <RepoRow key={repo.id} repo={repo} />
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Forks are excluded. Languages are counted per repository (its primary language), not by lines of code.
        {truncated
          ? ` Based on the ${result.repos.length} most recently pushed of ${profile.public_repos} public repositories.`
          : ''}
      </p>
    </div>
  )
}
