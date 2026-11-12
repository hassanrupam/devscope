import { config } from '@/config'
import { AppError } from '@/lib/errors'
import { githubProfileSchema, searchResponseSchema, type GitHubProfile, type SearchUser } from './schema'

/** Max number of matching users returned (and cached) for one prefix search. */
export const SEARCH_MAX_RESULTS = 12
/** Fetch more than we show: GitHub matches anywhere in the login, we keep only prefix matches. */
const SEARCH_FETCH_SIZE = 30

export interface GitHubClient {
  fetchProfile(username: string, signal?: AbortSignal): Promise<GitHubProfile>
  /** Users whose login starts with `prefix` (already normalised to lower-case). */
  searchUsersByPrefix(prefix: string, signal?: AbortSignal): Promise<SearchUser[]>
}

export type ProfileFetcher = Pick<GitHubClient, 'fetchProfile'>
export type UserSearcher = Pick<GitHubClient, 'searchUsersByPrefix'>

function parseResetHeader(value: string | null): Date | undefined {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined
}

export function createGitHubClient(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  baseUrl: string = config.githubApiBase,
): GitHubClient {
  /** GET + status mapping + JSON parsing. Returns untrusted JSON; callers validate it. */
  async function getJson(path: string, signal?: AbortSignal, notFoundMessage?: string): Promise<unknown> {
    let response: Response
    try {
      // Only the Accept header is sent so the request stays a simple CORS request.
      response = await fetchImpl(`${baseUrl}${path}`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new AppError('network', 'Could not reach GitHub. Check your connection and try again.', {
        cause: error,
      })
    }

    if (response.status === 404 && notFoundMessage) {
      throw new AppError('not_found', notFoundMessage)
    }

    const rateRemaining = response.headers.get('x-ratelimit-remaining')
    if (response.status === 429 || (response.status === 403 && rateRemaining === '0')) {
      throw new AppError(
        'rate_limited',
        'GitHub rate limit reached for your network. Please try again later.',
        { resetAt: parseResetHeader(response.headers.get('x-ratelimit-reset')) },
      )
    }

    if (!response.ok) {
      throw new AppError('upstream', 'GitHub is having trouble right now. Please try again shortly.', {
        cause: new Error(`GitHub responded with HTTP ${response.status}`),
      })
    }

    try {
      return await response.json()
    } catch (error) {
      throw new AppError('upstream', 'GitHub returned an unreadable response.', { cause: error })
    }
  }

  return {
    async fetchProfile(username, signal) {
      const body = await getJson(
        `/users/${encodeURIComponent(username)}`,
        signal,
        `No GitHub user named "${username}" was found.`,
      )
      const parsed = githubProfileSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError('upstream', 'GitHub returned unexpected profile data.', { cause: parsed.error })
      }
      return parsed.data
    },

    async searchUsersByPrefix(prefix, signal) {
      const query = encodeURIComponent(`${prefix} in:login`)
      const body = await getJson(
        `/search/users?q=${query}&per_page=${SEARCH_FETCH_SIZE}&sort=followers&order=desc`,
        signal,
      )
      const parsed = searchResponseSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError('upstream', 'GitHub returned unexpected search data.', { cause: parsed.error })
      }
      return parsed.data.items
        .filter((user) => user.login.toLowerCase().startsWith(prefix))
        .slice(0, SEARCH_MAX_RESULTS)
    },
  }
}

export const githubClient = createGitHubClient()
