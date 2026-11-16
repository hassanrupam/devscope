import { config, isGitHubProxyEnabled } from '@/config'
import { AppError } from '@/lib/errors'
import {
  githubProfileSchema,
  repoSchema,
  reportSchema,
  searchResponseSchema,
  type GitHubProfile,
  type Report,
  type Repo,
  type SearchUser,
} from './schema'

/** Max number of matching users returned (and cached) for one prefix search. */
export const SEARCH_MAX_RESULTS = 12
/** Fetch more than we show: GitHub matches anywhere in the login, we keep only prefix matches. */
const SEARCH_FETCH_SIZE = 30

/** Repositories fetched per user (one request). Users with more public repos are truncated. */
export const REPOS_PER_USER = 100

export interface GitHubClient {
  fetchProfile(username: string, signal?: AbortSignal): Promise<GitHubProfile>
  /** The user's own public repositories (forks included, flagged), most recently pushed first. */
  fetchRepos(username: string, signal?: AbortSignal): Promise<Repo[]>
  /** Users whose login starts with `prefix` (already normalised to lower-case). */
  searchUsersByPrefix(prefix: string, signal?: AbortSignal): Promise<SearchUser[]>
  /**
   * Activity report (contribution calendar, collaboration, sentiment). Needs the token-adding proxy,
   * because GitHub's GraphQL API always requires authentication.
   */
  fetchReport(username: string, signal?: AbortSignal): Promise<Report>
}

export type ProfileFetcher = Pick<GitHubClient, 'fetchProfile'>
export type UserSearcher = Pick<GitHubClient, 'searchUsersByPrefix'>
export type RepoFetcher = Pick<GitHubClient, 'fetchRepos'>
export type ReportFetcher = Pick<GitHubClient, 'fetchReport'>

function parseResetHeader(value: string | null): Date | undefined {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined
}

export function createGitHubClient(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  baseUrl: string = config.githubApiBase,
  viaProxy: boolean = isGitHubProxyEnabled,
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

    // Behind the proxy, a 404 without the proxy's marker header is the platform saying the function
    // is missing (not deployed), which must not be reported as "user not found".
    const proxyMissing = viaProxy && !response.headers.has('x-devscope-proxy')
    if (response.status === 404 && notFoundMessage && !proxyMissing) {
      throw new AppError('not_found', notFoundMessage)
    }

    const rateRemaining = response.headers.get('x-ratelimit-remaining')
    if (response.status === 429 || (response.status === 403 && rateRemaining === '0')) {
      throw new AppError(
        'rate_limited',
        'GitHub rate limit reached. Please try again later.',
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

    async fetchReport(username, signal) {
      if (!viaProxy) {
        throw new AppError('unavailable', 'Activity insights need the GitHub proxy to be enabled for this deployment.')
      }
      const body = await getJson(
        `/users/${encodeURIComponent(username)}/report`,
        signal,
        `No GitHub user named "${username}" was found.`,
      )
      const parsed = reportSchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError('upstream', 'GitHub returned unexpected report data.', { cause: parsed.error })
      }
      return parsed.data
    },

    async fetchRepos(username, signal) {
      const body = await getJson(
        `/users/${encodeURIComponent(username)}/repos?per_page=${REPOS_PER_USER}&sort=pushed&direction=desc&type=owner`,
        signal,
        `No GitHub user named "${username}" was found.`,
      )
      if (!Array.isArray(body)) {
        throw new AppError('upstream', 'GitHub returned unexpected repository data.')
      }
      // One malformed repository must not hide all the others: validate and keep the good ones.
      return body.flatMap((item: unknown) => {
        const parsed = repoSchema.safeParse(item)
        return parsed.success ? [parsed.data] : []
      })
    },
  }
}

export const githubClient = createGitHubClient()
