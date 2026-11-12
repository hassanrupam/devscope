import { isAppError } from '@/lib/errors'

/** A row in the shared cache. */
export interface CachedEntry<T> {
  data: T
  fetchedAt: Date
}

/** Shared (cross-visitor) cache. Methods throw if the cache service is unavailable. */
export interface SharedCache<T> {
  get(key: string): Promise<CachedEntry<T> | null>
  /** True if this caller may refresh the entry; false if someone else already is. */
  acquireLock(key: string): Promise<boolean>
  releaseLock(key: string): Promise<void>
  /** Saves and returns the server-side refresh timestamp. */
  save(key: string, data: T): Promise<Date>
}

export type CacheStatus =
  /** Shared cache worked normally. */
  | 'ok'
  /** Shared cache could not be reached (or is not configured); GitHub was used directly. */
  | 'unavailable'
  /** Data came from GitHub but saving it to the shared cache failed. */
  | 'write_failed'

export interface CacheMeta {
  /** Where the data came from for THIS lookup. */
  source: 'cache' | 'github'
  /** When the data was last refreshed from GitHub. */
  fetchedAt: Date
  /** True when expired cache data is shown because a refresh failed. */
  stale: boolean
  cacheStatus: CacheStatus
}

export interface CacheFirstResult<T> extends CacheMeta {
  data: T
}

export interface CacheFirstDeps {
  ttlMs: number
  lockWaitAttempts: number
  lockWaitIntervalMs: number
  now: () => Date
  sleep: (ms: number) => Promise<void>
}

/**
 * Cache-first lookup shared by every feature that reads GitHub data:
 *  1. fresh shared-cache hit        -> return it, GitHub is never called
 *  2. miss / expired                -> claim a refresh lock, load from GitHub, save, return
 *  3. lock held by someone else     -> briefly wait for their result
 *  4. refresh fails, stale cache    -> return stale data (flagged)
 *  5. refresh fails, no cache       -> rethrow the (user-safe) error
 */
export async function cacheFirst<T>(
  args: { key: string; cache: SharedCache<T> | null; load: () => Promise<T> } & CacheFirstDeps,
): Promise<CacheFirstResult<T>> {
  const { key, cache, load, ttlMs, lockWaitAttempts, lockWaitIntervalMs, now, sleep } = args
  let cacheUsable = cache !== null
  let cached: CachedEntry<T> | null = null

  const isFresh = (entry: CachedEntry<T>) => now().getTime() - entry.fetchedAt.getTime() < ttlMs
  const fromCache = (entry: CachedEntry<T>, stale: boolean): CacheFirstResult<T> => ({
    data: entry.data,
    source: 'cache',
    fetchedAt: entry.fetchedAt,
    stale,
    cacheStatus: cacheUsable ? 'ok' : 'unavailable',
  })

  if (cache) {
    try {
      cached = await cache.get(key)
    } catch {
      cacheUsable = false
    }
  }

  if (cached && isFresh(cached)) return fromCache(cached, false)

  let holdsLock = false
  if (cache && cacheUsable) {
    try {
      holdsLock = await cache.acquireLock(key)
    } catch {
      cacheUsable = false
    }
  }

  // Another visitor is already refreshing this entry: give them a moment to finish.
  if (cache && cacheUsable && !holdsLock) {
    for (let attempt = 0; attempt < lockWaitAttempts; attempt++) {
      await sleep(lockWaitIntervalMs)
      try {
        const latest = await cache.get(key)
        if (latest && isFresh(latest)) return fromCache(latest, false)
      } catch {
        cacheUsable = false
        break
      }
    }
  }

  let saved = false
  try {
    const data = await load()
    let fetchedAt = now()
    let cacheStatus: CacheStatus = cacheUsable ? 'ok' : 'unavailable'

    if (cache && cacheUsable) {
      try {
        fetchedAt = await cache.save(key, data)
        saved = true
      } catch {
        cacheStatus = 'write_failed'
      }
    }
    return { data, source: 'github', fetchedAt, stale: false, cacheStatus }
  } catch (error) {
    // Show expired data if GitHub is merely failing. A real 404 means the account is gone.
    if (cached && !(isAppError(error) && error.code === 'not_found')) return fromCache(cached, true)
    throw error
  } finally {
    if (cache && holdsLock && !saved) {
      try {
        await cache.releaseLock(key)
      } catch {
        // The lock expires on its own after a few seconds.
      }
    }
  }
}
