import { config } from '@/config'
import { parsePrefix } from '@/lib/username'
import { cacheFirst, type CacheFirstDeps, type CacheMeta } from '@/services/cache/cacheFirst'
import { searchCache, type SearchCache } from '@/services/cache/searchCache'
import { githubClient, type UserSearcher } from '@/services/github/githubClient'
import type { SearchUser } from '@/services/github/schema'

export interface SearchResult extends CacheMeta {
  users: SearchUser[]
}

export interface SearchServiceDeps extends CacheFirstDeps {
  cache: SearchCache | null
  github: UserSearcher
}

export function createSearchService(overrides: Partial<SearchServiceDeps> = {}) {
  const deps: SearchServiceDeps = {
    cache: searchCache,
    github: githubClient,
    ttlMs: config.cacheTtlMs,
    lockWaitAttempts: config.lockWaitAttempts,
    lockWaitIntervalMs: config.lockWaitIntervalMs,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...overrides,
  }

  /** Cache-first search for users whose login starts with the given text. */
  async function searchUsers(rawPrefix: string): Promise<SearchResult> {
    const prefix = parsePrefix(rawPrefix)
    const { data, ...meta } = await cacheFirst({
      ...deps,
      key: prefix,
      cache: deps.cache,
      load: () => deps.github.searchUsersByPrefix(prefix),
    })
    return { users: data, ...meta }
  }

  return { searchUsers }
}

export const searchService = createSearchService()
