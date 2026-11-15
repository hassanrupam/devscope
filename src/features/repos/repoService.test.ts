import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import type { CachedEntry } from '@/services/cache/cacheFirst'
import type { RepoCache } from '@/services/cache/repoCache'
import type { RepoFetcher } from '@/services/github/githubClient'
import type { Repo } from '@/services/github/schema'
import { createRepoService } from './repoService'

const NOW = new Date('2026-11-12T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const repos: Repo[] = [
  {
    id: 1,
    name: 'hello',
    html_url: 'https://github.com/octocat/hello',
    description: null,
    language: 'Go',
    stargazers_count: 3,
    forks_count: 1,
    fork: false,
    archived: false,
    pushed_at: null,
  },
]

function setup(opts: { cached?: CachedEntry<Repo[]> | null; githubResult?: Repo[] | Error; noCache?: boolean } = {}) {
  const cache: RepoCache = {
    get: vi.fn(async () => opts.cached ?? null),
    acquireLock: vi.fn(async () => true),
    releaseLock: vi.fn(async () => {}),
    save: vi.fn(async () => NOW),
  }
  const github: RepoFetcher = {
    fetchRepos: vi.fn(async () => {
      const result = opts.githubResult ?? repos
      if (result instanceof Error) throw result
      return result
    }),
  }
  const service = createRepoService({
    cache: opts.noCache ? null : cache,
    github,
    ttlMs: 7 * DAY,
    lockWaitAttempts: 1,
    lockWaitIntervalMs: 1,
    now: () => NOW,
    sleep: async () => {},
  })
  return { service, cache, github }
}

describe('repoService.getRepos', () => {
  it('serves a fresh shared-cache hit without calling GitHub', async () => {
    const { service, github } = setup({ cached: { data: repos, fetchedAt: new Date(NOW.getTime() - DAY) } })
    const result = await service.getRepos('OctoCat')
    expect(result).toMatchObject({ repos, source: 'cache', stale: false })
    expect(github.fetchRepos).not.toHaveBeenCalled()
  })

  it('normalises the username used as cache key', async () => {
    const { service, cache } = setup({ cached: { data: repos, fetchedAt: NOW } })
    await service.getRepos('  @OCTOCAT ')
    expect(cache.get).toHaveBeenCalledWith('octocat')
  })

  it('fetches and saves on a miss', async () => {
    const { service, github, cache } = setup()
    const result = await service.getRepos('octocat')
    expect(result).toMatchObject({ repos, source: 'github' })
    expect(github.fetchRepos).toHaveBeenCalledWith('octocat')
    expect(cache.save).toHaveBeenCalledWith('octocat', repos)
  })

  it('caches an empty repository list too', async () => {
    const { service, cache } = setup({ githubResult: [] })
    await service.getRepos('newbie')
    expect(cache.save).toHaveBeenCalledWith('newbie', [])
  })

  it('serves expired data flagged as stale when GitHub fails', async () => {
    const { service } = setup({
      cached: { data: repos, fetchedAt: new Date(NOW.getTime() - 9 * DAY) },
      githubResult: new AppError('rate_limited', 'limit'),
    })
    expect(await service.getRepos('octocat')).toMatchObject({ repos, stale: true, source: 'cache' })
  })

  it('throws when GitHub fails and nothing is cached', async () => {
    const { service } = setup({ githubResult: new AppError('upstream', 'down') })
    await expect(service.getRepos('octocat')).rejects.toMatchObject({ code: 'upstream' })
  })

  it('rejects invalid usernames before any request', async () => {
    const { service, cache, github } = setup()
    await expect(service.getRepos('not valid!')).rejects.toMatchObject({ code: 'invalid_username' })
    expect(cache.get).not.toHaveBeenCalled()
    expect(github.fetchRepos).not.toHaveBeenCalled()
  })
})
