import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import type { CachedEntry } from '@/services/cache/cacheFirst'
import type { SearchCache } from '@/services/cache/searchCache'
import type { UserSearcher } from '@/services/github/githubClient'
import type { SearchUser } from '@/services/github/schema'
import { createSearchService } from './searchService'

const NOW = new Date('2026-11-12T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const users: SearchUser[] = [
  { id: 1, login: 'torvalds', type: 'User', avatar_url: 'https://a.test/1', html_url: 'https://github.com/torvalds' },
  { id: 2, login: 'tor-project', type: 'Organization', avatar_url: 'https://a.test/2', html_url: 'https://github.com/tor-project' },
]

function setup(opts: { cached?: CachedEntry<SearchUser[]> | null; githubResult?: SearchUser[] | Error; noCache?: boolean } = {}) {
  const cache: SearchCache = {
    get: vi.fn(async () => opts.cached ?? null),
    acquireLock: vi.fn(async () => true),
    releaseLock: vi.fn(async () => {}),
    save: vi.fn(async () => NOW),
  }
  const github: UserSearcher = {
    searchUsersByPrefix: vi.fn(async () => {
      const result = opts.githubResult ?? users
      if (result instanceof Error) throw result
      return result
    }),
  }
  const service = createSearchService({
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

describe('searchService.searchUsers', () => {
  it('returns a fresh shared-cache hit without calling GitHub', async () => {
    const { service, github } = setup({ cached: { data: users, fetchedAt: new Date(NOW.getTime() - DAY) } })
    const result = await service.searchUsers('Tor')

    expect(result).toMatchObject({ users, source: 'cache', stale: false, cacheStatus: 'ok' })
    expect(github.searchUsersByPrefix).not.toHaveBeenCalled()
  })

  it('normalises the prefix before using it as the cache key', async () => {
    const { service, cache } = setup({ cached: { data: users, fetchedAt: NOW } })
    await service.searchUsers('  @TOR ')
    expect(cache.get).toHaveBeenCalledWith('tor')
  })

  it('searches GitHub and saves the results on a miss', async () => {
    const { service, github, cache } = setup()
    const result = await service.searchUsers('tor')

    expect(result).toMatchObject({ users, source: 'github', stale: false })
    expect(github.searchUsersByPrefix).toHaveBeenCalledWith('tor')
    expect(cache.save).toHaveBeenCalledWith('tor', users)
  })

  it('caches an empty result list too', async () => {
    const { service, cache } = setup({ githubResult: [] })
    const result = await service.searchUsers('zzzzqq')
    expect(result.users).toEqual([])
    expect(cache.save).toHaveBeenCalledWith('zzzzqq', [])
  })

  it('serves expired results flagged as stale when GitHub fails', async () => {
    const { service } = setup({
      cached: { data: users, fetchedAt: new Date(NOW.getTime() - 9 * DAY) },
      githubResult: new AppError('rate_limited', 'limit'),
    })
    const result = await service.searchUsers('tor')
    expect(result).toMatchObject({ users, source: 'cache', stale: true })
  })

  it('throws when GitHub fails and nothing is cached', async () => {
    const { service } = setup({ githubResult: new AppError('rate_limited', 'limit') })
    await expect(service.searchUsers('tor')).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('rejects invalid prefixes before any request', async () => {
    const { service, cache, github } = setup()
    await expect(service.searchUsers('no spaces!')).rejects.toMatchObject({ code: 'invalid_username' })
    expect(cache.get).not.toHaveBeenCalled()
    expect(github.searchUsersByPrefix).not.toHaveBeenCalled()
  })

  it('works without a configured cache', async () => {
    const { service } = setup({ noCache: true })
    const result = await service.searchUsers('tor')
    expect(result).toMatchObject({ source: 'github', cacheStatus: 'unavailable' })
  })
})
