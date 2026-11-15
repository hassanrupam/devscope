import type { AppError } from '@/lib/errors'
import type { GitHubProfile } from '@/services/github/schema'
import type { RepoSummary } from '@/features/repos/summarize'

type LoadState = 'loading' | 'ready' | 'error'

/** Everything the comparison needs about one user, already flattened for rendering. */
export interface ComparisonColumn {
  username: string
  profile: GitHubProfile | null
  profileState: LoadState
  profileError: AppError | null
  summary: RepoSummary | null
  repoState: LoadState
  /** True when the user has more public repositories than were analysed. */
  truncated: boolean
}

export interface MetricDef {
  id: string
  label: string
  /** Which data the value depends on, to show the right loading/error state. */
  source: 'profile' | 'repos'
  /** Only metrics where "more" is a meaningful win get a highlighted best value. */
  higherIsBetter: boolean
  value: (column: ComparisonColumn) => number | null
}

export const METRICS: MetricDef[] = [
  { id: 'followers', label: 'Followers', source: 'profile', higherIsBetter: true, value: (c) => c.profile?.followers ?? null },
  { id: 'following', label: 'Following', source: 'profile', higherIsBetter: false, value: (c) => c.profile?.following ?? null },
  { id: 'public_repos', label: 'Public repositories', source: 'profile', higherIsBetter: true, value: (c) => c.profile?.public_repos ?? null },
  { id: 'original', label: 'Original repositories (no forks)', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.originalRepos ?? null },
  { id: 'stars', label: 'Stars received', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.totalStars ?? null },
  { id: 'forks', label: 'Forks received', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.totalForks ?? null },
  { id: 'languages', label: 'Languages used', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.languages.length ?? null },
]

/**
 * Indexes of the highest value(s). Returns nothing when fewer than two values are known or when all
 * known values are equal, because then no one is "ahead".
 */
export function bestIndexes(values: Array<number | null>): number[] {
  const known = values.filter((v): v is number => v !== null)
  if (known.length < 2) return []
  const max = Math.max(...known)
  if (known.every((v) => v === max)) return []
  return values.flatMap((v, i) => (v === max ? [i] : []))
}
