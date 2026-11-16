/**
 * Builds the compact "developer report" for one user from GitHub's GraphQL + REST APIs.
 *
 * Why this lives in the edge function: the contribution calendar only exists in GraphQL, and GraphQL
 * always needs a token, which must never reach the browser. The browser asks for
 * `GET /users/{username}/report` and receives one small JSON document that it then stores in the
 * shared Supabase cache, so GitHub is hit once per user per cache window, not once per visitor.
 *
 * Plain Web-standard TypeScript (no Deno APIs) so it can be unit-tested with Vitest.
 */
import { analyzeText, type SentimentSummary } from './sentiment.ts'

const GITHUB_GRAPHQL = 'https://api.github.com/graphql'
const GITHUB_API = 'https://api.github.com'
const CALENDAR_DAYS = 371
const MAX_NETWORK_REPOS = 7
const CONTRIBUTORS_PER_REPO = 5

export interface ReportContributor {
  login: string
  avatarUrl: string
  contributions: number
}

export interface ReportNetworkRepo {
  nameWithOwner: string
  url: string
  ownerLogin: string
  ownerAvatar: string
  stars: number
  /** The user's own commits + pull requests in this repository during the last year. */
  contributions: number
  /** True when the repository belongs to someone else. */
  external: boolean
  contributors: ReportContributor[]
}

export interface Report {
  login: string
  generatedAt: string
  /** Daily contribution counts, oldest first, starting at `start` (YYYY-MM-DD, UTC). */
  calendar: { start: string; counts: number[] }
  totals: { contributions: number; commits: number; pullRequests: number; issues: number; reviews: number }
  /** Repositories the user owns (forks excluded), grouped by the year they were created. */
  starsByYear: Array<{ year: number; repos: number; stars: number }>
  collaboration: {
    repos: ReportNetworkRepo[]
    topCoContributors: Array<{ login: string; avatarUrl: string; sharedRepos: number; contributions: number }>
  }
  sentiment: SentimentSummary
}

export class ReportError extends Error {
  readonly status: number
  readonly headers: Record<string, string>
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message)
    this.name = 'ReportError'
    this.status = status
    this.headers = headers
  }
}

/** The one and only GraphQL document this function ever sends. */
export const REPORT_QUERY = /* GraphQL */ `
  query DevExploreReport($login: String!, $from: DateTime!) {
    user(login: $login) {
      login
      contributionsCollection(from: $from) {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
        commitContributionsByRepository(maxRepositories: 8) {
          contributions { totalCount }
          repository { nameWithOwner url stargazerCount owner { login avatarUrl } }
        }
        pullRequestContributionsByRepository(maxRepositories: 8) {
          contributions { totalCount }
          repository { nameWithOwner url stargazerCount owner { login avatarUrl } }
        }
      }
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100, orderBy: { field: STARGAZERS, direction: DESC }) {
        nodes { nameWithOwner url createdAt stargazerCount owner { login avatarUrl } }
      }
      issueComments(last: 50) { nodes { body } }
      pullRequests(last: 20) { nodes { title } }
      issues(last: 20) { nodes { title } }
    }
  `

/* ---------- GraphQL response shape (only what we read) ---------- */

interface GqlRepository {
  nameWithOwner: string
  url: string
  stargazerCount: number
  owner: { login: string; avatarUrl: string }
}
interface GqlByRepo {
  contributions: { totalCount: number }
  repository: GqlRepository
}
export interface GqlUser {
  login: string
  contributionsCollection: {
    totalCommitContributions: number
    totalIssueContributions: number
    totalPullRequestContributions: number
    totalPullRequestReviewContributions: number
    contributionCalendar: {
      totalContributions: number
      weeks: Array<{ contributionDays: Array<{ date: string; contributionCount: number }> }>
    }
    commitContributionsByRepository: GqlByRepo[]
    pullRequestContributionsByRepository: GqlByRepo[]
  }
  repositories: { nodes: Array<(GqlRepository & { createdAt: string }) | null> }
  issueComments: { nodes: Array<{ body: string } | null> }
  pullRequests: { nodes: Array<{ title: string } | null> }
  issues: { nodes: Array<{ title: string } | null> }
}

const nonNull = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined

/* ---------- Pure composition ---------- */

function composeCalendar(user: GqlUser): Report['calendar'] {
  const days = user.contributionsCollection.contributionCalendar.weeks
    .flatMap((week) => week.contributionDays)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-CALENDAR_DAYS)
  return { start: days[0]?.date ?? '', counts: days.map((d) => Math.max(0, Math.trunc(d.contributionCount))) }
}

function composeStarsByYear(user: GqlUser): Report['starsByYear'] {
  const byYear = new Map<number, { repos: number; stars: number }>()
  for (const repo of user.repositories.nodes.filter(nonNull)) {
    const year = new Date(repo.createdAt).getUTCFullYear()
    if (!Number.isFinite(year)) continue
    const entry = byYear.get(year) ?? { repos: 0, stars: 0 }
    entry.repos += 1
    entry.stars += repo.stargazerCount
    byYear.set(year, entry)
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, ...v }))
}

/** Picks the repositories shown in the collaboration network: most-contributed external ones, then own top repos. */
export function pickNetworkRepos(user: GqlUser): Array<Omit<ReportNetworkRepo, 'contributors'>> {
  const login = user.login.toLowerCase()
  const mine = new Map<string, number>()
  const known = new Map<string, GqlRepository>()
  for (const entry of [
    ...user.contributionsCollection.commitContributionsByRepository,
    ...user.contributionsCollection.pullRequestContributionsByRepository,
  ]) {
    const key = entry.repository.nameWithOwner
    mine.set(key, (mine.get(key) ?? 0) + entry.contributions.totalCount)
    known.set(key, entry.repository)
  }

  const external = [...mine.entries()]
    .filter(([name]) => (known.get(name)?.owner.login ?? '').toLowerCase() !== login)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, contributions]) => ({ repo: known.get(name) as GqlRepository, contributions, external: true }))

  const own = user.repositories.nodes
    .filter(nonNull)
    .slice(0, 3)
    .map((repo) => ({ repo, contributions: Math.max(1, mine.get(repo.nameWithOwner) ?? 0), external: false }))

  const seen = new Set<string>()
  return [...external, ...own]
    .filter(({ repo }) => (seen.has(repo.nameWithOwner) ? false : (seen.add(repo.nameWithOwner), true)))
    .slice(0, MAX_NETWORK_REPOS)
    .map(({ repo, contributions, external: isExternal }) => ({
      nameWithOwner: repo.nameWithOwner,
      url: repo.url,
      ownerLogin: repo.owner.login,
      ownerAvatar: repo.owner.avatarUrl,
      stars: repo.stargazerCount,
      contributions,
      external: isExternal,
    }))
}

export function composeReport(
  user: GqlUser,
  contributorsByRepo: Map<string, ReportContributor[]>,
  now: Date,
): Report {
  const cc = user.contributionsCollection
  const repos: ReportNetworkRepo[] = pickNetworkRepos(user).map((repo) => ({
    ...repo,
    contributors: contributorsByRepo.get(repo.nameWithOwner) ?? [],
  }))

  const co = new Map<string, { login: string; avatarUrl: string; sharedRepos: number; contributions: number }>()
  for (const repo of repos) {
    for (const person of repo.contributors) {
      const entry = co.get(person.login) ?? { login: person.login, avatarUrl: person.avatarUrl, sharedRepos: 0, contributions: 0 }
      entry.sharedRepos += 1
      entry.contributions += person.contributions
      co.set(person.login, entry)
    }
  }

  const texts = [
    ...user.issueComments.nodes.filter(nonNull).map((n) => n.body),
    ...user.pullRequests.nodes.filter(nonNull).map((n) => n.title),
    ...user.issues.nodes.filter(nonNull).map((n) => n.title),
  ]

  return {
    login: user.login,
    generatedAt: now.toISOString(),
    calendar: composeCalendar(user),
    totals: {
      contributions: cc.contributionCalendar.totalContributions,
      commits: cc.totalCommitContributions,
      pullRequests: cc.totalPullRequestContributions,
      issues: cc.totalIssueContributions,
      reviews: cc.totalPullRequestReviewContributions,
    },
    starsByYear: composeStarsByYear(user),
    collaboration: {
      repos,
      topCoContributors: [...co.values()]
        .sort((a, b) => b.sharedRepos - a.sharedRepos || b.contributions - a.contributions || a.login.localeCompare(b.login))
        .slice(0, 6),
    },
    sentiment: analyzeText(texts),
  }
}

/* ---------- Network orchestration ---------- */

function rateHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-resource', 'retry-after']) {
    const value = response.headers.get(name)
    if (value !== null) out[name] = value
  }
  return out
}

interface GraphQlBody {
  data?: { user: GqlUser | null } | null
  errors?: Array<{ type?: string; message?: string }>
}

export async function buildReport(
  login: string,
  deps: { token: string; fetchImpl: typeof fetch; now?: () => Date },
): Promise<Report> {
  const now = (deps.now ?? (() => new Date()))()
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${deps.token}`,
    'User-Agent': 'devexplore-github-proxy',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const from = new Date(now.getTime() - 364 * 24 * 60 * 60 * 1000).toISOString()
  let response: Response
  try {
    response = await deps.fetchImpl(GITHUB_GRAPHQL, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: REPORT_QUERY, variables: { login, from } }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ReportError(502, 'Could not reach GitHub')
  }

  if (response.status === 401) throw new ReportError(502, 'GitHub rejected the proxy token')
  if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
    throw new ReportError(429, 'GitHub rate limit reached', rateHeaders(response))
  }
  if (!response.ok) throw new ReportError(502, `GitHub responded with HTTP ${response.status}`)

  let body: GraphQlBody
  try {
    body = (await response.json()) as GraphQlBody
  } catch {
    throw new ReportError(502, 'GitHub returned an unreadable response')
  }

  const types = (body.errors ?? []).map((e) => e.type)
  if (types.includes('RATE_LIMITED')) throw new ReportError(429, 'GitHub rate limit reached', rateHeaders(response))
  // GraphQL answers an unknown user (or an organisation) with data.user = null and a NOT_FOUND error.
  if (types.includes('NOT_FOUND') || (body.data && body.data.user === null)) throw new ReportError(404, 'Not Found')
  if (!body.data?.user) throw new ReportError(502, 'GitHub returned unexpected data')

  const user = body.data.user
  const picks = pickNetworkRepos(user)

  const settled = await Promise.allSettled(
    picks.map(async (repo): Promise<[string, ReportContributor[]]> => {
      const path = repo.nameWithOwner.split('/').map(encodeURIComponent).join('/')
      const res = await deps.fetchImpl(`${GITHUB_API}/repos/${path}/contributors?per_page=${CONTRIBUTORS_PER_REPO + 3}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return [repo.nameWithOwner, []]
      const rows = (await res.json().catch(() => [])) as Array<{
        login?: string
        avatar_url?: string
        contributions?: number
        type?: string
      }>
      if (!Array.isArray(rows)) return [repo.nameWithOwner, []]
      const people = rows
        .filter((r) => r.type === 'User' && r.login && r.avatar_url && r.login.toLowerCase() !== user.login.toLowerCase())
        .slice(0, CONTRIBUTORS_PER_REPO)
        .map((r) => ({ login: r.login as string, avatarUrl: r.avatar_url as string, contributions: r.contributions ?? 0 }))
      return [repo.nameWithOwner, people]
    }),
  )

  // A failed contributors lookup only means that repository shows no co-contributors.
  const contributors = new Map(settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])))
  return composeReport(user, contributors, now)
}
