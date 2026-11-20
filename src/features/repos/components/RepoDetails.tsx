import { motion } from 'framer-motion'
import { ForkIcon, StarIcon } from '@/components/ui/icons'
import { toAppError } from '@/lib/errors'
import { cn, formatCount, formatRelativeTime } from '@/lib/utils'
import { ReportCard } from '@/features/report/components/ReportCard'
import { ResultStatus } from '@/features/profile/components/ResultStatus'
import type { GitHubProfile, Repo } from '@/services/github/schema'
import { isTruncated, summarizeRepos, type RepoSummary } from '../summarize'
import { useRepos } from '../useRepos'
import { LanguageBar } from './LanguageBar'

function Tile({ label, value, accent, hint }: { label: string; value: string; accent: string; hint?: string }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-3 text-center dark:border-white/[0.06] dark:bg-white/[0.03]">
      <span aria-hidden="true" className="absolute inset-x-3 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <dd className="truncate text-lg font-bold tabular-nums sm:text-xl">{value}</dd>
      <dt className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</dt>
      {hint ? <p className="truncate text-[0.65rem] text-slate-500 dark:text-slate-500">{hint}</p> : null}
    </div>
  )
}

function SubHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
      <span aria-hidden="true" className="h-3.5 w-0.5 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
      {children}
    </h3>
  )
}

function RepoRow({ repo, maxStars, index }: { repo: Repo; maxStars: number; index: number }) {
  const share = maxStars > 0 ? (repo.stargazers_count / maxStars) * 100 : 0
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.05, duration: 0.45 }}
      className="group relative min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white/60 p-3 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white hover:shadow-lg dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-indigo-400/40 dark:hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
          {repo.name}
        </a>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums text-amber-600 dark:text-amber-300" aria-label={`${repo.stargazers_count} stars`}>
          <StarIcon className="size-3.5" />
          {formatCount(repo.stargazers_count)}
        </span>
      </div>
      {repo.description ? <p className="mt-1 line-clamp-2 break-words text-sm text-slate-600 dark:text-slate-400">{repo.description}</p> : null}
      <div aria-hidden="true" className="mt-2.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--r-track)' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(share, repo.stargazers_count > 0 ? 3 : 0)}%` }} transition={{ delay: 0.2 + index * 0.05, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500" />
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {repo.language ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-indigo-400" />
            {repo.language}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <ForkIcon className="size-3" />
          {formatCount(repo.forks_count)} forks
        </span>
        {repo.license ? <span>{repo.license}</span> : null}
        {repo.archived ? <span className="rounded bg-slate-200 px-1 text-[0.65rem] font-semibold uppercase dark:bg-white/10">Archived</span> : null}
        {repo.pushed_at ? <span>Pushed {formatRelativeTime(new Date(repo.pushed_at))}</span> : null}
      </p>
      {repo.topics.length > 0 ? (
        <p className="mt-2 flex flex-wrap gap-1">
          {repo.topics.slice(0, 4).map((topic) => (
            <span key={topic} className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[0.65rem] text-indigo-700 dark:text-indigo-300">
              {topic}
            </span>
          ))}
        </p>
      ) : null}
    </motion.li>
  )
}

function YearBars({ data }: { data: RepoSummary['createdByYear'] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div role="img" aria-label={`Repositories created per year: ${data.map((d) => `${d.year} ${d.count}`).join(', ')}`} className="flex h-24 items-end gap-1.5 rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 pb-6 pt-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
      {data.map((d, i) => (
        <div key={d.year} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.15 + i * 0.04, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%`, originY: 1 }}
            className={cn('rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-400', d.count === 0 && 'opacity-25')}
            title={`${d.year}: ${d.count}`}
          />
          <span aria-hidden="true" className="absolute inset-x-0 -bottom-5 truncate text-center text-[0.6rem] text-slate-500">{data.length > 9 && i % 2 === 1 ? '' : `’${String(d.year).slice(2)}`}</span>
        </div>
      ))}
    </div>
  )
}

/** Repository-based details for a profile: totals, language mix and top repositories. */
export function RepoDetails({ profile }: { profile: GitHubProfile }) {
  const { data, error, isFetching } = useRepos(profile.login)

  return (
    <ReportCard label="Repositories and languages" index={1} className="h-full" bodyClassName="">
      <h2 id="repo-details-heading" className="mb-3 text-base font-semibold tracking-tight sm:text-lg">
        Repositories &amp; languages
      </h2>

      {isFetching ? (
        <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading repositories">
          <div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-20 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p role="status" className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Repository details are unavailable right now. {toAppError(error).message}
        </p>
      ) : data ? (
        <RepoDetailsBody profile={profile} result={data} />
      ) : null}
    </ReportCard>
  )
}

function RepoDetailsBody({ profile, result }: { profile: GitHubProfile; result: NonNullable<ReturnType<typeof useRepos>['data']> }) {
  const summary = summarizeRepos(result.repos)
  const truncated = isTruncated(profile.public_repos, result.repos.length)
  const maxStars = summary.topRepos[0]?.stargazers_count ?? 0

  return (
    <div className="space-y-5">
      <ResultStatus result={result} testId="repos-status" />

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="repo-totals">
        <Tile label="Stars" value={formatCount(summary.totalStars)} accent="#fbbf24" />
        <Tile label="Forks" value={formatCount(summary.totalForks)} accent="#34d399" />
        <Tile label="Own repos" value={formatCount(summary.originalRepos)} accent="#22d3ee" hint={summary.forkedRepos > 0 ? `+${summary.forkedRepos} forked` : undefined} />
        <Tile label="Avg stars / repo" value={summary.avgStars.toLocaleString('en')} accent="#a78bfa" />
        <Tile label="Active · 90 days" value={formatCount(summary.activeRecently)} accent="#60a5fa" hint={summary.lastPushedAt ? `last push ${formatRelativeTime(new Date(summary.lastPushedAt))}` : undefined} />
        <Tile label="Open issues" value={formatCount(summary.openIssues)} accent="#fb7185" hint={summary.archivedRepos > 0 ? `${summary.archivedRepos} archived` : undefined} />
      </dl>

      <section aria-labelledby="languages-heading">
        <SubHeading id="languages-heading">Languages</SubHeading>
        <LanguageBar languages={summary.languages} />
      </section>

      {summary.createdByYear.length > 1 ? (
        <section aria-labelledby="created-heading">
          <SubHeading id="created-heading">Repositories created per year</SubHeading>
          <YearBars data={summary.createdByYear} />
        </section>
      ) : null}

      {summary.topics.length > 0 || summary.licenses.length > 0 ? (
        <section aria-labelledby="topics-heading">
          <SubHeading id="topics-heading">Topics &amp; licenses</SubHeading>
          <p className="flex flex-wrap gap-1.5">
            {summary.topics.map((t) => (
              <span key={t.topic} className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">
                {t.topic} <span className="text-slate-500">{t.count}</span>
              </span>
            ))}
            {summary.licenses.map((l) => (
              <span key={l.license} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                {l.license} <span className="text-slate-500">{l.count}</span>
              </span>
            ))}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="top-repos-heading">
        <SubHeading id="top-repos-heading">Most-starred repositories</SubHeading>
        {summary.topRepos.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No original public repositories.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2" data-testid="top-repos">
            {summary.topRepos.map((repo, i) => (
              <RepoRow key={repo.id} repo={repo} maxStars={maxStars} index={i} />
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Forks are excluded. Languages are counted per repository (its primary language), not by lines of code.
        {truncated ? ` Based on the ${result.repos.length} most recently pushed of ${profile.public_repos} public repositories.` : ''}
      </p>
    </div>
  )
}
