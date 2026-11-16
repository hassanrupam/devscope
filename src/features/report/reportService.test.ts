import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import type { Report } from '@/services/github/schema'
import { createReportService, MIN_REFRESH_AGE_MS } from './reportService'

const report = (login = 'octocat'): Report => ({
  login,
  generatedAt: '2026-11-16T00:00:00Z',
  calendar: { start: '2026-11-01', counts: [1, 2] },
  totals: { contributions: 3, commits: 3, pullRequests: 0, issues: 0, reviews: 0 },
  starsByYear: [],
  collaboration: { repos: [], topCoContributors: [] },
  sentiment: { score: 0, sampleSize: 0, words: [] },
})

const NOW = new Date('2026-11-16T12:00:00Z')

function setup(cached: { at: Date } | null) {
  const cache = {
    get: vi.fn(async () => (cached ? { data: report(), fetchedAt: cached.at } : null)),
    acquireLock: vi.fn(async () => true),
    releaseLock: vi.fn(async () => undefined),
    save: vi.fn(async () => NOW),
  }
  const github = { fetchReport: vi.fn(async () => report()) }
  const service = createReportService({ cache, github, ttlMs: 24 * 3600_000, now: () => NOW, sleep: async () => undefined })
  return { service, cache, github }
}

describe('reportService', () => {
  it('serves a fresh shared-cache report without calling GitHub', async () => {
    const { service, github } = setup({ at: new Date(NOW.getTime() - 3600_000) })
    const result = await service.getReport('OctoCat')
    expect(result.source).toBe('cache')
    expect(github.fetchReport).not.toHaveBeenCalled()
  })

  it('builds, then saves, on a cache miss', async () => {
    const { service, github, cache } = setup(null)
    const result = await service.getReport('octocat')
    expect(result.source).toBe('github')
    expect(github.fetchReport).toHaveBeenCalledWith('octocat')
    expect(cache.save).toHaveBeenCalledWith('octocat', expect.objectContaining({ login: 'octocat' }))
  })

  it('rebuilds an expired report', async () => {
    const { service, github } = setup({ at: new Date(NOW.getTime() - 25 * 3600_000) })
    await service.getReport('octocat')
    expect(github.fetchReport).toHaveBeenCalledOnce()
  })

  it('refresh keeps a report younger than the minimum age, so clicking cannot burn rate limit', async () => {
    const young = setup({ at: new Date(NOW.getTime() - MIN_REFRESH_AGE_MS / 2) })
    await young.service.getReport('octocat', { refresh: true })
    expect(young.github.fetchReport).not.toHaveBeenCalled()

    const old = setup({ at: new Date(NOW.getTime() - MIN_REFRESH_AGE_MS * 2) })
    await old.service.getReport('octocat', { refresh: true })
    expect(old.github.fetchReport).toHaveBeenCalledOnce()
  })

  it('falls back to a stale report when GitHub fails, but not for a missing user', async () => {
    const stale = setup({ at: new Date(NOW.getTime() - 48 * 3600_000) })
    stale.github.fetchReport.mockRejectedValueOnce(new AppError('upstream', 'down'))
    expect(await stale.service.getReport('octocat')).toMatchObject({ stale: true, source: 'cache' })

    const gone = setup({ at: new Date(NOW.getTime() - 48 * 3600_000) })
    gone.github.fetchReport.mockRejectedValueOnce(new AppError('not_found', 'gone'))
    await expect(gone.service.getReport('octocat')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('rejects invalid usernames', async () => {
    await expect(setup(null).service.getReport('not valid!')).rejects.toMatchObject({ code: 'invalid_username' })
  })
})
