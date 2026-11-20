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

export type MetricGroup = 'Audience' | 'Repositories' | 'Activity'

export interface MetricDef {
  id: string
  label: string
  group: MetricGroup
  /** Text appended to the number, e.g. "yrs". */
  unit?: string
  /** Which data the value depends on, to show the right loading/error state. */
  source: 'profile' | 'repos'
  /** Only metrics where "more" is a meaningful win get a highlighted best value. */
  higherIsBetter: boolean
  value: (column: ComparisonColumn) => number | null
}

const yearsSince = (iso: string | null | undefined): number | null =>
  // eslint-disable-next-line react-hooks/purity -- an age is relative to "now" by definition
  iso ? Math.round(((Date.now() - Date.parse(iso)) / (365.25 * 86_400_000)) * 10) / 10 : null

export const METRICS: MetricDef[] = [
  { id: 'followers', label: 'Followers', group: 'Audience', source: 'profile', higherIsBetter: true, value: (c) => c.profile?.followers ?? null },
  { id: 'following', label: 'Following', group: 'Audience', source: 'profile', higherIsBetter: false, value: (c) => c.profile?.following ?? null },
  { id: 'gists', label: 'Public gists', group: 'Audience', source: 'profile', higherIsBetter: true, value: (c) => c.profile?.public_gists ?? null },
  { id: 'age', label: 'Account age', group: 'Audience', unit: 'yrs', source: 'profile', higherIsBetter: false, value: (c) => yearsSince(c.profile?.created_at) },
  { id: 'public_repos', label: 'Public repositories', group: 'Repositories', source: 'profile', higherIsBetter: true, value: (c) => c.profile?.public_repos ?? null },
  { id: 'original', label: 'Original repositories (no forks)', group: 'Repositories', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.originalRepos ?? null },
  { id: 'stars', label: 'Stars received', group: 'Repositories', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.totalStars ?? null },
  { id: 'avg-stars', label: 'Average stars per repository', group: 'Repositories', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.avgStars ?? null },
  { id: 'forks', label: 'Forks received', group: 'Repositories', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.totalForks ?? null },
  { id: 'languages', label: 'Languages used', group: 'Repositories', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.languages.length ?? null },
  { id: 'active', label: 'Repositories pushed in 90 days', group: 'Activity', source: 'repos', higherIsBetter: true, value: (c) => c.summary?.activeRecently ?? null },
]

export const METRIC_GROUPS: MetricGroup[] = ['Audience', 'Repositories', 'Activity']

/** How many metrics each column leads (ties and unknown values do not count). */
export function winCounts(columns: ComparisonColumn[]): { wins: number[]; contested: number } {
  const wins = columns.map(() => 0)
  let contested = 0
  for (const metric of METRICS) {
    if (!metric.higherIsBetter) continue
    const values = columns.map((c) => {
      const state = metric.source === 'profile' ? c.profileState : c.repoState
      return state === 'ready' ? metric.value(c) : null
    })
    const best = bestIndexes(values)
    if (best.length === 0) continue
    contested++
    for (const i of best) wins[i] = (wins[i] ?? 0) + 1
  }
  return { wins, contested }
}

/** Languages that every loaded user has repositories in (needs at least two users with data). */
export function sharedLanguages(columns: ComparisonColumn[]): string[] {
  const sets = columns.flatMap((c) => (c.summary ? [new Set(c.summary.languages.map((l) => l.language))] : []))
  if (sets.length < 2) return []
  const [first, ...rest] = sets
  return [...(first ?? [])].filter((lang) => rest.every((set) => set.has(lang))).sort()
}

export const RADAR_AXES: Array<{ label: string; pick: (c: ComparisonColumn) => number | null }> = [
  { label: 'Followers', pick: (c) => c.profile?.followers ?? null },
  { label: 'Stars', pick: (c) => c.summary?.totalStars ?? null },
  { label: 'Forks', pick: (c) => c.summary?.totalForks ?? null },
  { label: 'Repos', pick: (c) => c.summary?.originalRepos ?? null },
  { label: 'Languages', pick: (c) => c.summary?.languages.length ?? null },
  { label: 'Activity', pick: (c) => c.summary?.activeRecently ?? null },
]

/**
 * Radar rows scaled 0-100 against the largest value on each axis. Square-root scaling keeps one huge
 * number (e.g. followers) from flattening everyone else into the centre.
 */
export function radarRows(columns: ComparisonColumn[]): Array<Record<string, string | number>> {
  return RADAR_AXES.map(({ label, pick }) => {
    const values = columns.map(pick)
    const max = Math.max(0, ...values.map((v) => v ?? 0))
    const row: Record<string, string | number> = { axis: label }
    columns.forEach((c, i) => {
      const v = values[i] ?? 0
      row[c.username] = max > 0 ? Math.round(Math.sqrt(v / max) * 100) : 0
    })
    return row
  })
}

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
