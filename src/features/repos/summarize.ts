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
}

const time = (value: string | null) => (value ? new Date(value).getTime() : 0)

/**
 * Derives display statistics from a user's repositories. Forks are excluded from every figure because
 * they are mostly other people's work. Languages are counted by each repository's primary language
 * (GitHub's `language` field), not by bytes of code.
 */
export function summarizeRepos(repos: Repo[], topN = 6): RepoSummary {
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

  return {
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

