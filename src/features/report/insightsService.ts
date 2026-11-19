import { config } from '@/config'
import { parseUsername } from '@/lib/username'
import { cacheFirst, type CacheFirstDeps, type CacheMeta } from '@/services/cache/cacheFirst'
import { insightsCache, type InsightsCache } from '@/services/cache/insightsCache'
import { githubClient, type InsightsFetcher } from '@/services/github/githubClient'
import type { ProjectInsights } from '@/services/github/schema'

export interface InsightsResult extends CacheMeta {
  insights: ProjectInsights
}

export interface InsightsServiceDeps extends CacheFirstDeps {
  cache: InsightsCache | null
  github: InsightsFetcher
}

export function createInsightsService(overrides: Partial<InsightsServiceDeps> = {}) {
  const deps: InsightsServiceDeps = {
    cache: insightsCache,
    github: githubClient,
    ttlMs: config.reportTtlMs,
    lockWaitAttempts: config.lockWaitAttempts * 4, // fans out to many calls, so waiters wait longer
    lockWaitIntervalMs: config.lockWaitIntervalMs,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...overrides,
  }

  async function getInsights(rawUsername: string): Promise<InsightsResult> {
    const username = parseUsername(rawUsername)
    const { data, ...meta } = await cacheFirst({
      ...deps,
      key: username,
      cache: deps.cache,
      load: () => deps.github.fetchInsights(username),
    })
    return { insights: data, ...meta }
  }

  return { getInsights }
}

export const insightsService = createInsightsService()
