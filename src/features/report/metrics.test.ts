import { describe, expect, it } from 'vitest'
import type { GitHubProfile, Repo } from '@/services/github/schema'
import {
  calendarDays,
  gaugeZone,
  impactScore,
  languageTree,
  sentimentLabel,
  starGrowth,
  streaks,
  summarizeCalendar,
  velocity,
  type Day,
} from './metrics'

const days = (counts: number[], start = '2026-01-01'): Day[] => calendarDays({ start, counts })

describe('calendarDays', () => {
  it('expands start + counts into consecutive UTC dates', () => {
    expect(days([1, 0, 3], '2026-02-27')).toEqual([
      { date: '2026-02-27', count: 1 },
      { date: '2026-02-28', count: 0 },
      { date: '2026-03-01', count: 3 },
    ])
  })
  it('returns nothing for an empty or invalid calendar', () => {
    expect(calendarDays({ start: '', counts: [] })).toEqual([])
    expect(calendarDays({ start: 'nope', counts: [1] })).toEqual([])
  })
})

describe('streaks', () => {
  it('finds the longest run and its dates', () => {
    const result = streaks(days([1, 1, 0, 2, 2, 2, 0, 1]))
    expect(result.longest).toEqual({ length: 3, start: '2026-01-04', end: '2026-01-06' })
  })
  it('counts the current streak, ignoring a quiet today', () => {
    expect(streaks(days([0, 1, 1, 1, 0])).current).toBe(3)
    expect(streaks(days([0, 1, 1, 1, 4])).current).toBe(4)
    expect(streaks(days([1, 1, 0, 0])).current).toBe(0)
  })
  it('handles no activity', () => {
    expect(streaks(days([0, 0, 0]))).toEqual({ longest: null, current: 0 })
    expect(streaks([])).toEqual({ longest: null, current: 0 })
  })
})

describe('velocity', () => {
  it('compares the last 30 days with the 30 before', () => {
    const v = velocity(days([...Array(30).fill(1), ...Array(30).fill(2)]))
    expect(v.prev30).toBe(30)
    expect(v.last30).toBe(60)
    expect(v.deltaPct).toBe(100)
    expect(v.perWeek).toBe(14)
    expect(v.daily).toHaveLength(30)
  })
  it('has no delta without a previous period', () => {
    expect(velocity(days(Array(30).fill(1))).deltaPct).toBeNull()
  })
  it('builds up to 12 weekly buckets', () => {
    expect(velocity(days(Array(200).fill(1))).weekly).toHaveLength(12)
    expect(velocity(days(Array(200).fill(1))).weekly.every((w) => w.count === 7)).toBe(true)
  })
})

describe('gaugeZone', () => {
  it('maps contributions per week to a zone', () => {
    expect(gaugeZone(0).label).toBe('Quiet')
    expect(gaugeZone(7).label).toBe('Steady')
    expect(gaugeZone(20).label).toBe('Active')
    expect(gaugeZone(99).label).toBe('Blazing')
  })
})

describe('summarizeCalendar', () => {
  it('summarises totals, active days and the busiest day', () => {
    const s = summarizeCalendar(days([0, 4, 0, 10, 1]))
    expect(s).toMatchObject({ total: 15, activeDays: 3, averagePerActiveDay: 5, maxCount: 10 })
    expect(s.busiest?.date).toBe('2026-01-04')
  })
})

describe('starGrowth', () => {
  it('fills gaps and accumulates', () => {
    expect(
      starGrowth(
        [
          { year: 2020, repos: 2, stars: 10 },
          { year: 2023, repos: 1, stars: 5 },
        ],
        2024,
      ).map((p) => [p.year, p.cumulative]),
    ).toEqual([
      [2020, 10],
      [2021, 10],
      [2022, 10],
      [2023, 15],
      [2024, 15],
    ])
  })
  it('is empty without repositories', () => expect(starGrowth([], 2026)).toEqual([]))
})

const profile = (over: Partial<GitHubProfile> = {}): GitHubProfile => ({
  id: 1,
  login: 'octocat',
  type: 'User',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  html_url: 'https://github.com/octocat',
  name: null,
  bio: null,
  company: null,
  location: null,
  blog: null,
  public_repos: 10,
  followers: 100,
  following: 5,
  created_at: '2016-01-01T00:00:00Z',
  public_gists: null,
  twitter_username: null,
  hireable: null,
  updated_at: null,
  ...over,
})

describe('impactScore', () => {
  const now = new Date('2026-01-01T00:00:00Z')
  it('stays within 0..100 and is higher for a bigger footprint', () => {
    const small = impactScore(profile({ followers: 2, public_repos: 1 }), { totalStars: 0, yearContributions: 3, now })
    const big = impactScore(profile({ followers: 50_000, public_repos: 200 }), { totalStars: 80_000, yearContributions: 4000, now })
    expect(small.score).toBeGreaterThanOrEqual(0)
    expect(big.score).toBeLessThanOrEqual(100)
    expect(big.score).toBeGreaterThan(small.score)
    expect(big.tier).toBe('Elite')
  })
  it('re-scales weights when stars/activity are unknown', () => {
    const r = impactScore(profile(), { now })
    expect(r.parts.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1)
    expect(r.parts).toHaveLength(3)
  })
})

const repo = (name: string, language: string | null, stars: number, fork = false): Repo => ({
  id: Math.floor(Math.random() * 1e6),
  name,
  html_url: `https://github.com/octocat/${name}`,
  description: null,
  language,
  stargazers_count: stars,
  forks_count: 0,
  fork,
  archived: false,
  pushed_at: null,
  created_at: null,
  open_issues_count: 0,
  topics: [],
  license: null,
})

describe('languageTree', () => {
  it('groups own repos by language, most-starred first, ignoring forks and unknown languages', () => {
    const tree = languageTree(
      [
        repo('a', 'Ruby', 5),
        repo('b', 'Ruby', 50),
        repo('c', 'Go', 1),
        repo('d', 'Rust', 999, true),
        repo('e', null, 100),
      ],
      3,
      4,
    )
    expect(tree.map((t) => t.language)).toEqual(['Ruby', 'Go'])
    expect(tree[0]?.repos.map((r) => r.name)).toEqual(['b', 'a'])
  })
  it('limits languages and repos', () => {
    const many = ['A', 'B', 'C', 'D'].flatMap((l, i) => Array.from({ length: 6 - i }, (_, k) => repo(`${l}${k}`, l, k)))
    const tree = languageTree(many, 3, 2)
    expect(tree).toHaveLength(3)
    expect(tree.every((t) => t.repos.length <= 2)).toBe(true)
  })
})

describe('sentimentLabel', () => {
  it('buckets scores', () => {
    expect([-0.9, -0.2, 0, 0.2, 0.8].map(sentimentLabel)).toEqual(['Critical', 'Mixed', 'Neutral', 'Positive', 'Happy'])
  })
})
