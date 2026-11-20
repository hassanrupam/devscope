import { describe, expect, it } from 'vitest'
import type { Repo } from '@/services/github/schema'
import { isTruncated, summarizeRepos } from './summarize'

let nextId = 1
const repo = (overrides: Partial<Repo> = {}): Repo => ({
  id: nextId++,
  name: `repo-${nextId}`,
  html_url: `https://github.com/u/repo-${nextId}`,
  description: null,
  language: null,
  stargazers_count: 0,
  forks_count: 0,
  fork: false,
  archived: false,
  pushed_at: null,
  created_at: null,
  open_issues_count: 0,
  topics: [],
  license: null,
  ...overrides,
})

describe('summarizeRepos', () => {
  it('returns zeros for no repositories', () => {
    expect(summarizeRepos([])).toEqual({
      originalRepos: 0,
      forkedRepos: 0,
      totalStars: 0,
      totalForks: 0,
      languages: [],
      topRepos: [],
      lastPushedAt: null,
      archivedRepos: 0,
      openIssues: 0,
      avgStars: 0,
      topics: [],
      licenses: [],
      createdByYear: [],
      activeRecently: 0,
    })
  })

  it('excludes forks from every figure but counts them separately', () => {
    const summary = summarizeRepos([
      repo({ stargazers_count: 10, forks_count: 2, language: 'Go' }),
      repo({ stargazers_count: 5, forks_count: 1, language: 'Go' }),
      repo({ fork: true, stargazers_count: 999, forks_count: 99, language: 'Rust', pushed_at: '2030-01-01T00:00:00Z' }),
    ])
    expect(summary).toMatchObject({ originalRepos: 2, forkedRepos: 1, totalStars: 15, totalForks: 3, lastPushedAt: null })
    expect(summary.languages.map((l) => l.language)).toEqual(['Go'])
  })

  it('computes language shares over repositories that have a language, sorted with ties alphabetical', () => {
    const summary = summarizeRepos([
      repo({ language: 'TypeScript' }),
      repo({ language: 'TypeScript' }),
      repo({ language: 'Python' }),
      repo({ language: 'Go' }),
      repo({ language: null }), // no language: not part of the denominator
    ])
    expect(summary.languages.map((l) => [l.language, l.repos, l.percent])).toEqual([
      ['TypeScript', 2, 50],
      ['Go', 1, 25],
      ['Python', 1, 25],
    ])
  })

  it('lists the most-starred original repositories first, with stable tie-breaking', () => {
    const summary = summarizeRepos(
      [
        repo({ name: 'b', stargazers_count: 5, pushed_at: '2026-01-01T00:00:00Z' }),
        repo({ name: 'a', stargazers_count: 5, pushed_at: '2026-01-01T00:00:00Z' }),
        repo({ name: 'new', stargazers_count: 5, pushed_at: '2026-06-01T00:00:00Z' }),
        repo({ name: 'top', stargazers_count: 50 }),
        repo({ name: 'forked', fork: true, stargazers_count: 1000 }),
      ],
      3,
    )
    expect(summary.topRepos.map((r) => r.name)).toEqual(['top', 'new', 'a'])
  })

  it('reports the latest push among original repositories', () => {
    const summary = summarizeRepos([
      repo({ pushed_at: '2026-03-01T00:00:00Z' }),
      repo({ pushed_at: '2026-09-15T12:00:00Z' }),
      repo({ pushed_at: null }),
    ])
    expect(summary.lastPushedAt).toBe('2026-09-15T12:00:00.000Z')
  })
})

describe('isTruncated', () => {
  it('is true only when the list hit the 100-repository cap and the profile has more', () => {
    expect(isTruncated(250, 100)).toBe(true)
    expect(isTruncated(100, 100)).toBe(false)
  })

  it('ignores small mismatches caused by profile and repository caches being refreshed at different times', () => {
    expect(isTruncated(8, 3)).toBe(false)
    expect(isTruncated(60, 59)).toBe(false)
  })
})


describe('summarizeRepos extras', () => {
  const now = new Date('2026-11-18T00:00:00Z')
  it('derives averages, topics, licenses, yearly creation and recent activity', () => {
    const summary = summarizeRepos(
      [
        repo({ stargazers_count: 10, topics: ['cli', 'go'], license: 'MIT', created_at: '2022-05-01T00:00:00Z', pushed_at: '2026-11-01T00:00:00Z' }),
        repo({ stargazers_count: 5, topics: ['cli'], license: 'MIT', created_at: '2024-02-01T00:00:00Z', pushed_at: '2025-01-01T00:00:00Z', archived: true, open_issues_count: 3 }),
        repo({ stargazers_count: 999, fork: true, topics: ['ignored'] }),
      ],
      6,
      now,
    )
    expect(summary.avgStars).toBe(7.5)
    expect(summary.topics).toEqual([{ topic: 'cli', count: 2 }, { topic: 'go', count: 1 }])
    expect(summary.licenses).toEqual([{ license: 'MIT', count: 2 }])
    expect(summary.createdByYear.map((y) => [y.year, y.count])).toEqual([[2022, 1], [2023, 0], [2024, 1]])
    expect(summary.activeRecently).toBe(1)
    expect(summary.archivedRepos).toBe(1)
    expect(summary.openIssues).toBe(3)
  })
})
