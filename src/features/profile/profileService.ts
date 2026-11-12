import { config } from '@/config'
import { parseUsername } from '@/lib/username'
import { cacheFirst, type CacheFirstDeps, type CacheMeta, type SharedCache } from '@/services/cache/cacheFirst'
import { profileCache, type ProfileCache } from '@/services/cache/profileCache'
import { githubClient, type ProfileFetcher } from '@/services/github/githubClient'
import type { GitHubProfile } from '@/services/github/schema'

export type { CacheStatus } from '@/services/cache/cacheFirst'

export interface ProfileResult extends CacheMeta {
  profile: GitHubProfile
}

export interface ProfileServiceDeps extends CacheFirstDeps {
  cache: ProfileCache | null
  github: ProfileFetcher
}

function toSharedCache(cache: ProfileCache): SharedCache<GitHubProfile> {
  return {
    get: async (key) => {
      const entry = await cache.get(key)
      return entry ? { data: entry.profile, fetchedAt: entry.fetchedAt } : null
    },
    acquireLock: (key) => cache.acquireLock(key),
    releaseLock: (key) => cache.releaseLock(key),
    save: (key, data) => cache.save(key, data),
  }
}

export function createProfileService(overrides: Partial<ProfileServiceDeps> = {}) {
  const deps: ProfileServiceDeps = {
    cache: profileCache,
    github: githubClient,
    ttlMs: config.cacheTtlMs,
    lockWaitAttempts: config.lockWaitAttempts,
    lockWaitIntervalMs: config.lockWaitIntervalMs,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...overrides,
  }

  /** Cache-first lookup of one profile (see `cacheFirst` for the exact rules). */
  async function getProfile(rawUsername: string): Promise<ProfileResult> {
    const username = parseUsername(rawUsername)
    const { data, ...meta } = await cacheFirst({
      ...deps,
      key: username,
      cache: deps.cache ? toSharedCache(deps.cache) : null,
      load: () => deps.github.fetchProfile(username),
    })
    return { profile: data, ...meta }
  }

  return { getProfile }
}

export const profileService = createProfileService()
