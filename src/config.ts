/** Centralised, validated runtime configuration. Only public values live here. */

function parseTtlDays(raw: string | undefined): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7
}

export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '',
  /** How long a cached profile is considered fresh. Default: 7 days. */
  cacheTtlMs: parseTtlDays(import.meta.env.VITE_CACHE_TTL_DAYS as string | undefined) * 24 * 60 * 60 * 1000,
  /** If another visitor is refreshing the same user, poll the cache this many times... */
  lockWaitAttempts: 4,
  /** ...waiting this long between polls. */
  lockWaitIntervalMs: 750,
  githubApiBase: 'https://api.github.com',
} as const

export const isCacheConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
