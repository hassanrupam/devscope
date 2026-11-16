import { config } from '@/config'
import { parseUsername } from '@/lib/username'
import { cacheFirst, type CacheFirstDeps, type CacheMeta } from '@/services/cache/cacheFirst'
import { reportCache, type ReportCache } from '@/services/cache/reportCache'
import { githubClient, type ReportFetcher } from '@/services/github/githubClient'
import type { Report } from '@/services/github/schema'

export interface ReportResult extends CacheMeta {
  report: Report
}

export interface ReportServiceDeps extends CacheFirstDeps {
  cache: ReportCache | null
  github: ReportFetcher
}

/**
 * "Refresh data" never bypasses the shared cache blindly: a report younger than this is served as is,
 * so repeated clicks (or many visitors) cannot burn GitHub rate limit.
 */
export const MIN_REFRESH_AGE_MS = 60 * 60 * 1000

export function createReportService(overrides: Partial<ReportServiceDeps> = {}) {
  const deps: ReportServiceDeps = {
    cache: reportCache,
    github: githubClient,
    ttlMs: config.reportTtlMs,
    lockWaitAttempts: config.lockWaitAttempts * 3, // building a report takes longer than a profile
    lockWaitIntervalMs: config.lockWaitIntervalMs,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...overrides,
  }

  /**
   * Cache-first lookup of one user's report (see `cacheFirst` for the exact rules).
   * `refresh` lowers the freshness requirement to MIN_REFRESH_AGE_MS so an old cache entry is rebuilt.
   */
  async function getReport(rawUsername: string, options: { refresh?: boolean } = {}): Promise<ReportResult> {
    const username = parseUsername(rawUsername)
    const { data, ...meta } = await cacheFirst({
      ...deps,
      ttlMs: options.refresh ? Math.min(deps.ttlMs, MIN_REFRESH_AGE_MS) : deps.ttlMs,
      key: username,
      cache: deps.cache,
      load: () => deps.github.fetchReport(username),
    })
    return { report: data, ...meta }
  }

  return { getReport }
}

export const reportService = createReportService()
