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

