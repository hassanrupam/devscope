import { REPOS_PER_USER } from '@/services/github/githubClient'
import type { Repo } from '@/services/github/schema'

export interface LanguageShare {
  language: string
  /** Number of the user's own repositories whose primary language this is. */
  repos: number
  /** Share (0-100) of the repositories that report a primary language. */
  percent: number
}

export interface RepoSummary {
  /** Repositories the user created (forks excluded). All numbers below ignore forks. */
  originalRepos: number
  forkedRepos: number
  totalStars: number
  totalForks: number
  /** Every language, largest first (ties alphabetical). */
  languages: LanguageShare[]
  /** Most-starred original repositories. */
  topRepos: Repo[]
  /** Most recent push to an original repository. */
  lastPushedAt: string | null
  archivedRepos: number
  openIssues: number
  /** Average stars per original repository, one decimal. */
  avgStars: number
  /** Most used repository topics, largest first. */
  topics: Array<{ topic: string; count: number }>
  licenses: Array<{ license: string; count: number }>
  /** Original repositories created per calendar year, oldest first (gaps filled). */
  createdByYear: Array<{ year: number; count: number }>
  /** Repositories pushed to in the last 90 days. */
  activeRecently: number
}

const time = (value: string | null) => (value ? new Date(value).getTime() : 0)

/**
 * Derives display statistics from a user's repositories. Forks are excluded from every figure because
 * they are mostly other people's work. Languages are counted by each repository's primary language
 * (GitHub's `language` field), not by bytes of code.
 */
export function summarizeRepos(repos: Repo[], topN = 6, now: Date = new Date()): RepoSummary {
  const original = repos.filter((repo) => !repo.fork)

  const counts = new Map<string, number>()
  for (const repo of original) {
    if (repo.language) counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1)
  }
  const withLanguage = [...counts.values()].reduce((sum, n) => sum + n, 0)
  const languages = [...counts.entries()]
    .map(([language, count]) => ({ language, repos: count, percent: (count / withLanguage) * 100 }))
    .sort((a, b) => b.repos - a.repos || a.language.localeCompare(b.language))

  const topRepos = [...original]
    .sort(
      (a, b) =>
        b.stargazers_count - a.stargazers_count || time(b.pushed_at) - time(a.pushed_at) || a.name.localeCompare(b.name),
    )
    .slice(0, topN)

  const lastPushed = original.reduce((latest, repo) => Math.max(latest, time(repo.pushed_at)), 0)

  const tally = <T extends string>(values: T[]) => {
    const map = new Map<T, number>()
    for (const v of values) map.set(v, (map.get(v) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }
  const years = original.flatMap((repo) => (repo.created_at ? [new Date(repo.created_at).getUTCFullYear()] : []))
  const createdByYear: RepoSummary['createdByYear'] = []
  if (years.length > 0) {
    const counts = new Map<number, number>()
    for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1)
    for (let year = Math.min(...years); year <= Math.max(...years); year++) createdByYear.push({ year, count: counts.get(year) ?? 0 })
  }
  const totalStars = original.reduce((sum, repo) => sum + repo.stargazers_count, 0)
  const cutoff = now.getTime() - 90 * 86_400_000

  return {
    archivedRepos: original.filter((repo) => repo.archived).length,
    openIssues: original.reduce((sum, repo) => sum + repo.open_issues_count, 0),
    avgStars: original.length ? Math.round((totalStars / original.length) * 10) / 10 : 0,
    topics: tally(original.flatMap((repo) => repo.topics)).slice(0, 10).map(([topic, count]) => ({ topic, count })),
    licenses: tally(original.flatMap((repo) => (repo.license ? [repo.license] : []))).slice(0, 4).map(([license, count]) => ({ license, count })),
    createdByYear,
    activeRecently: original.filter((repo) => time(repo.pushed_at) >= cutoff).length,
    originalRepos: original.length,
    forkedRepos: repos.length - original.length,
    totalStars: original.reduce((sum, repo) => sum + repo.stargazers_count, 0),
    totalForks: original.reduce((sum, repo) => sum + repo.forks_count, 0),
    languages,
    topRepos,
    lastPushedAt: lastPushed > 0 ? new Date(lastPushed).toISOString() : null,
  }
}

/**
 * True only when the repository list was cut off at the per-user fetch limit and the profile reports
 * more public repositories than were analysed. (A smaller mismatch just means the profile and the
 * repository list were cached at different times.)
 */
export function isTruncated(publicRepos: number, fetchedCount: number): boolean {
  return fetchedCount >= REPOS_PER_USER && publicRepos > fetchedCount
}

