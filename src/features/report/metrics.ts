import type { GitHubProfile, Report, Repo } from '@/services/github/schema'

/* ------------------------------------------------------------------------------------------------
 * Pure functions that turn cached GitHub data into display numbers. No React, no network.
 * ---------------------------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000

export interface Day {
  /** YYYY-MM-DD (UTC) */
  date: string
  count: number
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Expands the compact calendar (start + counts) into dated days, oldest first. */
export function calendarDays(calendar: Report['calendar']): Day[] {
  if (!calendar.start || calendar.counts.length === 0) return []
  const startMs = Date.parse(`${calendar.start}T00:00:00Z`)
  if (Number.isNaN(startMs)) return []
  return calendar.counts.map((count, i) => ({ date: isoDate(startMs + i * DAY_MS), count }))
}

/* ---------- Streaks ---------- */

export interface Streak {
  length: number
  start: string
  end: string
}

export interface Streaks {
  longest: Streak | null
  /** Days in a row up to now. A quiet *today* does not break it: the day is not over yet. */
  current: number
}

export function streaks(days: Day[]): Streaks {
  let longest: Streak | null = null
  let runStart = -1

  days.forEach((day, i) => {
    if (day.count > 0) {
      if (runStart === -1) runStart = i
      const length = i - runStart + 1
      if (!longest || length > longest.length) {
        longest = { length, start: days[runStart]?.date ?? day.date, end: day.date }
      }
    } else {
      runStart = -1
    }
  })

  let current = 0
  let i = days.length - 1
  if (i >= 0 && days[i]?.count === 0) i-- // today may still be in progress
  while (i >= 0 && (days[i]?.count ?? 0) > 0) {
    current++
    i--
  }
  return { longest, current }
}

/* ---------- Velocity ---------- */

export interface Velocity {
  last30: number
  prev30: number
  /** Percent change vs. the previous 30 days; null when there is nothing to compare with. */
  deltaPct: number | null
  /** Average contributions per week over the last 30 days. */
  perWeek: number
  daily: Day[]
  /** Last 12 weeks, oldest first. */
  weekly: Array<{ label: string; count: number }>
}

const sum = (days: Day[]) => days.reduce((total, d) => total + d.count, 0)

export function velocity(days: Day[]): Velocity {
  const last = days.slice(-30)
  const prev = days.slice(-60, -30)
  const last30 = sum(last)
  const prev30 = sum(prev)

  const weekly: Velocity['weekly'] = []
  for (let w = 11; w >= 0; w--) {
    const end = days.length - w * 7
    const slice = days.slice(Math.max(0, end - 7), Math.max(0, end))
    if (slice.length === 0 && w > 0 && weekly.length === 0) continue
    weekly.push({ label: slice[0]?.date ?? '', count: sum(slice) })
  }

  return {
    last30,
    prev30,
    deltaPct: prev30 > 0 ? Math.round(((last30 - prev30) / prev30) * 100) : null,
    perWeek: Math.round(((last30 / Math.max(1, last.length)) * 7) * 10) / 10,
    daily: last,
    weekly,
  }
}

export const GAUGE_MAX = 40

export interface GaugeZone {
  label: string
  from: number
}

/** Zones of the velocity gauge (contributions per week). */
export const GAUGE_ZONES: GaugeZone[] = [
  { label: 'Quiet', from: 0 },
  { label: 'Steady', from: 5 },
  { label: 'Active', from: 15 },
  { label: 'Blazing', from: 28 },
]

export function gaugeZone(perWeek: number): GaugeZone {
  return [...GAUGE_ZONES].reverse().find((z) => perWeek >= z.from) ?? GAUGE_ZONES[0]!
}

/* ---------- Calendar summary ---------- */

export interface CalendarSummary {
  total: number
  activeDays: number
  busiest: Day | null
  averagePerActiveDay: number
  maxCount: number
}

export function summarizeCalendar(days: Day[]): CalendarSummary {
  const active = days.filter((d) => d.count > 0)
  const total = sum(days)
  const busiest = active.reduce<Day | null>((best, d) => (!best || d.count > best.count ? d : best), null)
  return {
    total,
    activeDays: active.length,
    busiest,
    averagePerActiveDay: active.length ? Math.round((total / active.length) * 10) / 10 : 0,
    maxCount: busiest?.count ?? 0,
  }
}

/* ---------- Star growth ---------- */

export interface StarPoint {
  year: number
  /** Stars on repositories created in this year. */
  stars: number
  /** Running total of stars on repositories created up to and including this year. */
  cumulative: number
  repos: number
}

/** Fills the gaps between the first and the current year so the chart has no holes. */
export function starGrowth(rows: Report['starsByYear'], currentYear: number): StarPoint[] {
  if (rows.length === 0) return []
  const byYear = new Map(rows.map((r) => [r.year, r]))
  const first = Math.min(...rows.map((r) => r.year))
  const out: StarPoint[] = []
  let cumulative = 0
  for (let year = first; year <= Math.max(currentYear, first); year++) {
    const row = byYear.get(year)
    cumulative += row?.stars ?? 0
    out.push({ year, stars: row?.stars ?? 0, cumulative, repos: row?.repos ?? 0 })
  }
  return out
}

/* ---------- Impact score ---------- */

export interface ImpactPart {
  label: string
  /** 0..1 */
  value: number
  /** Share of the final score this part can contribute (weights add up to 1). */
  weight: number
  detail: string
}

export interface ImpactScore {
  /** 0..100 */
  score: number
  tier: string
  parts: ImpactPart[]
}

const logScale = (value: number, max: number) => Math.min(1, Math.log10(1 + Math.max(0, value)) / Math.log10(1 + max))

const TIERS: Array<[number, string]> = [
  [80, 'Elite'],
  [60, 'Influential'],
  [40, 'Established'],
  [20, 'Active'],
  [0, 'Emerging'],
]

/**
 * DevExplore's own 0-100 estimate of a developer's public footprint. It is NOT a GitHub ranking.
 * Every input is log-scaled so a few huge numbers cannot drown out everything else. Parts that cannot
 * be measured (e.g. no report yet) are left out and the remaining weights are re-scaled.
 */
export function impactScore(
  profile: GitHubProfile,
  options: { totalStars?: number; yearContributions?: number; now?: Date } = {},
): ImpactScore {
  const now = options.now ?? new Date()
  const years = profile.created_at ? Math.max(0, (now.getTime() - Date.parse(profile.created_at)) / (365.25 * DAY_MS)) : 0

  const parts: ImpactPart[] = [
    { label: 'Followers', value: logScale(profile.followers, 100_000), weight: 0.3, detail: `${profile.followers.toLocaleString('en')} followers` },
    { label: 'Public repos', value: logScale(profile.public_repos, 300), weight: 0.1, detail: `${profile.public_repos.toLocaleString('en')} repositories` },
    { label: 'Account age', value: Math.min(1, years / 10), weight: 0.1, detail: `${years.toFixed(1)} years on GitHub` },
  ]
  if (options.totalStars !== undefined) {
    parts.push({ label: 'Stars earned', value: logScale(options.totalStars, 100_000), weight: 0.3, detail: `${options.totalStars.toLocaleString('en')} stars on own repos` })
  }
  if (options.yearContributions !== undefined) {
    parts.push({ label: 'Recent activity', value: logScale(options.yearContributions, 5_000), weight: 0.2, detail: `${options.yearContributions.toLocaleString('en')} contributions in a year` })
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
  const score = Math.round((parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight) * 100)
  const tier = TIERS.find(([min]) => score >= min)?.[1] ?? 'Emerging'
  return { score, tier, parts: parts.map((p) => ({ ...p, weight: p.weight / totalWeight })) }
}

/* ---------- Language ecosystem tree ---------- */

export interface TreeRepo {
  name: string
  url: string
  stars: number
}

export interface TreeLanguage {
  language: string
  /** Own repositories (forks excluded) whose primary language this is. */
  repoCount: number
  repos: TreeRepo[]
}

/** Top languages (by repository count) with each one's most-starred repositories. */
export function languageTree(repos: Repo[], maxLanguages = 3, maxRepos = 4): TreeLanguage[] {
  const groups = new Map<string, Repo[]>()
  for (const repo of repos) {
    if (repo.fork || !repo.language) continue
    groups.set(repo.language, [...(groups.get(repo.language) ?? []), repo])
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, maxLanguages)
    .map(([language, list]) => ({
      language,
      repoCount: list.length,
      repos: [...list]
        .sort((a, b) => b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name))
        .slice(0, maxRepos)
        .map((r) => ({ name: r.name, url: r.html_url, stars: r.stargazers_count })),
    }))
}

/* ---------- Sentiment ---------- */

export type SentimentLabel = 'Critical' | 'Mixed' | 'Neutral' | 'Positive' | 'Happy'

export function sentimentLabel(score: number): SentimentLabel {
  if (score <= -0.4) return 'Critical'
  if (score <= -0.12) return 'Mixed'
  if (score < 0.12) return 'Neutral'
  if (score < 0.4) return 'Positive'
  return 'Happy'
}
