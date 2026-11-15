import { config } from '@/config'
import { parseUsername } from '@/lib/username'
import { cacheFirst, type CacheFirstDeps, type CacheMeta } from '@/services/cache/cacheFirst'
import { repoCache, type RepoCache } from '@/services/cache/repoCache'
import { githubClient, type RepoFetcher } from '@/services/github/githubClient'
import type { Repo } from '@/services/github/schema'

export interface RepoResult extends CacheMeta {
  repos: Repo[]
}

export interface RepoServiceDeps extends CacheFirstDeps {
  cache: RepoCache | null
  github: RepoFetcher
}

export function createRepoService(overrides: Partial<RepoServiceDeps> = {}) {
  const deps: RepoServiceDeps = {
    cache: repoCache,
    github: githubClient,
    ttlMs: config.cacheTtlMs,
    lockWaitAttempts: config.lockWaitAttempts,
    lockWaitIntervalMs: config.lockWaitIntervalMs,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...overrides,
  }

  /** Cache-first lookup of one user's repositories (see `cacheFirst` for the exact rules). */
  async function getRepos(rawUsername: string): Promise<RepoResult> {
    const username = parseUsername(rawUsername)
    const { data, ...meta } = await cacheFirst({
      ...deps,
      key: username,
      cache: deps.cache,
      load: () => deps.github.fetchRepos(username),
    })
    return { repos: data, ...meta }
  }

  return { getRepos }
}

export const repoService = createRepoService()
