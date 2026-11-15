/** Centralised, validated runtime configuration. Only public values live here. */

function parseTtlDays(raw: string | undefined): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7
}

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, '') || ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

/**
 * When enabled, GitHub requests go through the `github-proxy` Supabase Edge Function, which adds a
 * server-side token (5,000 requests/hour instead of 60/hour per visitor IP). The token itself is never
 * in the browser. Needs VITE_SUPABASE_URL as well, since the function lives on the Supabase project.
 */
const githubProxyRequested = (import.meta.env.VITE_GITHUB_PROXY as string | undefined)?.trim().toLowerCase() === 'true'
export const isGitHubProxyEnabled = githubProxyRequested && supabaseUrl !== ''

export const config = {
  supabaseUrl,
  supabaseAnonKey,
  /** How long a cached profile is considered fresh. Default: 7 days. */
  cacheTtlMs: parseTtlDays(import.meta.env.VITE_CACHE_TTL_DAYS as string | undefined) * 24 * 60 * 60 * 1000,
  /** If another visitor is refreshing the same user, poll the cache this many times... */
  lockWaitAttempts: 4,
  /** ...waiting this long between polls. */
  lockWaitIntervalMs: 750,
  /** Base URL for GitHub REST calls: the token-adding proxy when enabled, otherwise GitHub directly. */
  /** Maximum number of users in the side-by-side comparison. */
  maxCompareUsers: 3,
  githubApiBase: isGitHubProxyEnabled ? `${supabaseUrl}/functions/v1/github-proxy` : 'https://api.github.com',
} as const

export const isCacheConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
