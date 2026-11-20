import { describe, expect, it } from 'vitest'
import type { GitHubProfile } from '@/services/github/schema'
import type { RepoSummary } from '@/features/repos/summarize'
import { bestIndexes, METRICS, radarRows, sharedLanguages, winCounts, type ComparisonColumn } from './metrics'

describe('bestIndexes', () => {
  it('returns the index of the single highest value', () => {
    expect(bestIndexes([3, 10, 7])).toEqual([1])
  })

  it('returns every index when the top value is tied', () => {
    expect(bestIndexes([10, 4, 10])).toEqual([0, 2])
  })

  it('highlights nobody when all known values are equal', () => {
    expect(bestIndexes([5, 5, 5])).toEqual([])
    expect(bestIndexes([0, 0])).toEqual([])
  })

  it('needs at least two known values', () => {
    expect(bestIndexes([])).toEqual([])
    expect(bestIndexes([8])).toEqual([])
    expect(bestIndexes([8, null])).toEqual([])
  })

  it('ignores unknown values when ranking the rest', () => {
    expect(bestIndexes([null, 2, 9, null])).toEqual([2])
  })
})

const profile = { followers: 100, following: 5, public_repos: 40 } as GitHubProfile
const summary = {
  originalRepos: 30,
  totalStars: 1234,
  totalForks: 56,
  languages: [{ language: 'Go', repos: 3, percent: 100 }],
} as RepoSummary

const column = (overrides: Partial<ComparisonColumn> = {}): ComparisonColumn => ({
  username: 'u',
  profile,
  profileState: 'ready',
  profileError: null,
  summary,
  repoState: 'ready',
  truncated: false,
  ...overrides,
})

describe('METRICS', () => {
  const byId = Object.fromEntries(METRICS.map((m) => [m.id, m]))

  it('reads values from the profile and the repository summary', () => {
    const c = column()
    expect(byId.followers?.value(c)).toBe(100)
    expect(byId.following?.value(c)).toBe(5)
    expect(byId.public_repos?.value(c)).toBe(40)
    expect(byId.original?.value(c)).toBe(30)
    expect(byId.stars?.value(c)).toBe(1234)
    expect(byId.forks?.value(c)).toBe(56)
    expect(byId.languages?.value(c)).toBe(1)
  })

  it('returns null when the data is missing', () => {
    const c = column({ profile: null, summary: null })
    for (const metric of METRICS) expect(metric.value(c)).toBeNull()
  })

  it('does not rank "following" as better when higher', () => {
    expect(byId.following?.higherIsBetter).toBe(false)
  })
})

describe('comparison helpers', () => {
  const lang = (language: string) => ({ language, repos: 1, percent: 50 })
  const mk = (username: string, followers: number, stars: number, languages: string[]) =>
    column({
      username,
      profile: { ...(column().profile as NonNullable<ComparisonColumn['profile']>), followers },
      summary: { ...(column().summary as NonNullable<ComparisonColumn['summary']>), totalStars: stars, languages: languages.map(lang) },
    })

  it('counts the metrics each column leads', () => {
    const { wins, contested } = winCounts([mk('a', 100, 5, ['Go']), mk('b', 50, 9, ['Go'])])
    expect(wins[0]).toBeGreaterThanOrEqual(1)
    expect(wins[1]).toBeGreaterThanOrEqual(1)
    expect(contested).toBeGreaterThanOrEqual(2)
  })

  it('finds languages used by everyone', () => {
    expect(sharedLanguages([mk('a', 1, 1, ['Go', 'Rust', 'C']), mk('b', 1, 1, ['Rust', 'Go'])])).toEqual(['Go', 'Rust'])
    expect(sharedLanguages([mk('a', 1, 1, ['Go'])])).toEqual([])
  })

  it('scales radar axes against the largest value with sqrt smoothing', () => {
    const rows = radarRows([mk('a', 100, 4, ['Go']), mk('b', 25, 4, ['Go'])])
    const followers = rows.find((r) => r.axis === 'Followers')
    expect(followers).toMatchObject({ a: 100, b: 50 })
    expect(rows.find((r) => r.axis === 'Stars')).toMatchObject({ a: 100, b: 100 })
  })
})
