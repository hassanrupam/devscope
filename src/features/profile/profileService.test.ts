import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import type { CachedProfile, ProfileCache } from '@/services/cache/profileCache'
import type { ProfileFetcher } from '@/services/github/githubClient'
import type { GitHubProfile } from '@/services/github/schema'
import { createProfileService } from './profileService'

const NOW = new Date('2026-11-12T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const TTL = 7 * DAY

const profile: GitHubProfile = {
  id: 1,
  login: 'octocat',
  type: 'User',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  html_url: 'https://github.com/octocat',
  name: 'The Octocat',
  bio: null,
  company: null,
  location: null,
  blog: null,
  public_repos: 1,
  followers: 2,
  following: 3,
  created_at: null,
  public_gists: null,
  twitter_username: null,
  hireable: null,
  updated_at: null,
}

const entry = (ageMs: number): CachedProfile => ({ profile, fetchedAt: new Date(NOW.getTime() - ageMs) })

function setup(opts: {
  cached?: CachedProfile | null
  lock?: boolean
  githubResult?: GitHubProfile | Error
  cacheError?: Partial<Record<keyof ProfileCache, Error>>
  noCache?: boolean
} = {}) {
  const cache: ProfileCache = {
    get: vi.fn(async () => {
      if (opts.cacheError?.get) throw opts.cacheError.get
      return opts.cached ?? null
    }),
    acquireLock: vi.fn(async () => {
      if (opts.cacheError?.acquireLock) throw opts.cacheError.acquireLock
      return opts.lock ?? true
    }),
    releaseLock: vi.fn(async () => {
      if (opts.cacheError?.releaseLock) throw opts.cacheError.releaseLock
    }),
    save: vi.fn(async () => {
      if (opts.cacheError?.save) throw opts.cacheError.save
      return NOW
    }),
  }
  const github: ProfileFetcher = {
    fetchProfile: vi.fn(async () => {
      const result = opts.githubResult ?? profile
      if (result instanceof Error) throw result
      return result
    }),
  }
  const sleep = vi.fn(async () => {})
  const service = createProfileService({
    cache: opts.noCache ? null : cache,
    github,
    ttlMs: TTL,
    lockWaitAttempts: 3,
    lockWaitIntervalMs: 10,
    now: () => NOW,
    sleep,
  })
  return { service, cache, github, sleep }
}

describe('profileService.getProfile', () => {
  it('returns a fresh shared-cache hit without calling GitHub', async () => {
    const { service, github, cache } = setup({ cached: entry(1 * DAY) })
    const result = await service.getProfile('OctoCat')

    expect(result).toMatchObject({ source: 'cache', stale: false, cacheStatus: 'ok' })
    expect(github.fetchProfile).not.toHaveBeenCalled()
    expect(cache.acquireLock).not.toHaveBeenCalled()
  })

  it('normalises capitalisation before touching cache and GitHub', async () => {
    const { service, cache } = setup({ cached: entry(DAY) })
    await service.getProfile('  @OCTOCAT ')
    expect(cache.get).toHaveBeenCalledWith('octocat')
  })

  it('fetches from GitHub and saves on a cache miss', async () => {
    const { service, github, cache } = setup({ cached: null })
    const result = await service.getProfile('octocat')

    expect(result).toMatchObject({ source: 'github', stale: false, cacheStatus: 'ok', fetchedAt: NOW })
    expect(github.fetchProfile).toHaveBeenCalledWith('octocat')
    expect(cache.save).toHaveBeenCalledWith('octocat', profile)
    expect(cache.releaseLock).not.toHaveBeenCalled() // save releases it server-side
  })

  it('refreshes an expired entry from GitHub and updates the cache', async () => {
    const { service, github, cache } = setup({ cached: entry(8 * DAY) })
    const result = await service.getProfile('octocat')

    expect(result.source).toBe('github')
    expect(github.fetchProfile).toHaveBeenCalledTimes(1)
    expect(cache.save).toHaveBeenCalledTimes(1)
  })

  it('serves stale data with a flag when the refresh fails', async () => {
    const { service, cache } = setup({
      cached: entry(8 * DAY),
      githubResult: new AppError('rate_limited', 'limit'),
    })
    const result = await service.getProfile('octocat')

    expect(result).toMatchObject({ source: 'cache', stale: true })
    expect(cache.save).not.toHaveBeenCalled()
    expect(cache.releaseLock).toHaveBeenCalledWith('octocat')
  })

  it('does not serve stale data when GitHub says the user no longer exists', async () => {
    const { service } = setup({ cached: entry(8 * DAY), githubResult: new AppError('not_found', 'gone') })
    await expect(service.getProfile('octocat')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws not_found for an unknown user and stores nothing', async () => {
    const { service, cache } = setup({ githubResult: new AppError('not_found', 'nope') })
    await expect(service.getProfile('ghost')).rejects.toMatchObject({ code: 'not_found' })
    expect(cache.save).not.toHaveBeenCalled()
    expect(cache.releaseLock).toHaveBeenCalled()
  })

  it('throws the GitHub error when there is no cache to fall back on', async () => {
    const { service } = setup({ githubResult: new AppError('network', 'offline') })
    await expect(service.getProfile('octocat')).rejects.toMatchObject({ code: 'network' })
  })

  it('rejects invalid usernames before any network call', async () => {
    const { service, cache, github } = setup()
    await expect(service.getProfile('bad name!')).rejects.toMatchObject({ code: 'invalid_username' })
    expect(cache.get).not.toHaveBeenCalled()
    expect(github.fetchProfile).not.toHaveBeenCalled()
  })

  it('waits for another visitor holding the refresh lock and uses their result', async () => {
    const { service, github, cache, sleep } = setup({ cached: null, lock: false })
    vi.mocked(cache.get).mockResolvedValueOnce(null).mockResolvedValueOnce(entry(1000))

    const result = await service.getProfile('octocat')

    expect(result).toMatchObject({ source: 'cache', stale: false })
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(github.fetchProfile).not.toHaveBeenCalled()
  })

  it('falls back to GitHub if the lock holder never finishes', async () => {
    const { service, github, sleep } = setup({ cached: null, lock: false })
    const result = await service.getProfile('octocat')

    expect(sleep).toHaveBeenCalledTimes(3)
    expect(github.fetchProfile).toHaveBeenCalledTimes(1)
    expect(result.source).toBe('github')
  })

  it('uses GitHub directly and reports cacheStatus=unavailable when the cache read fails', async () => {
    const { service, github, cache } = setup({ cacheError: { get: new Error('db down') } })
    const result = await service.getProfile('octocat')

    expect(result).toMatchObject({ source: 'github', cacheStatus: 'unavailable' })
    expect(github.fetchProfile).toHaveBeenCalledTimes(1)
    expect(cache.save).not.toHaveBeenCalled()
  })

  it('still returns the profile when saving fails, flagged as write_failed', async () => {
    const { service, cache } = setup({ cacheError: { save: new Error('write denied') } })
    const result = await service.getProfile('octocat')

    expect(result).toMatchObject({ source: 'github', cacheStatus: 'write_failed' })
    expect(cache.releaseLock).toHaveBeenCalled()
  })

  it('serves stale data and flags the cache as unavailable if lock acquisition breaks and GitHub fails', async () => {
    const { service } = setup({
      cached: entry(9 * DAY),
      cacheError: { acquireLock: new Error('db down') },
      githubResult: new AppError('upstream', 'down'),
    })
    const result = await service.getProfile('octocat')
    expect(result).toMatchObject({ stale: true, cacheStatus: 'unavailable' })
  })

  it('works without any cache configured', async () => {
    const { service, github } = setup({ noCache: true })
    const result = await service.getProfile('octocat')

    expect(result).toMatchObject({ source: 'github', cacheStatus: 'unavailable' })
    expect(github.fetchProfile).toHaveBeenCalledTimes(1)
  })
})
