import { describe, expect, it, vi } from 'vitest'
import { reportSchema } from '../../../src/services/github/schema'
import { buildReport, composeReport, pickNetworkRepos, REPORT_QUERY, ReportError, type GqlUser } from './report'

const NOW = new Date('2026-11-16T12:00:00Z')
const avatar = (n: string) => `https://avatars.githubusercontent.com/${n}?v=4`
const repo = (nameWithOwner: string, stars = 0) => {
  const owner = nameWithOwner.split('/')[0] as string
  return { nameWithOwner, url: `https://github.com/${nameWithOwner}`, stargazerCount: stars, owner: { login: owner, avatarUrl: avatar(owner) } }
}

const user: GqlUser = {
  login: 'octocat',
  contributionsCollection: {
    totalCommitContributions: 40,
    totalIssueContributions: 3,
    totalPullRequestContributions: 7,
    totalPullRequestReviewContributions: 2,
    contributionCalendar: {
      totalContributions: 52,
      weeks: [
        { contributionDays: [{ date: '2026-11-08', contributionCount: 0 }, { date: '2026-11-09', contributionCount: 5 }] },
        { contributionDays: [{ date: '2026-11-10', contributionCount: 12 }, { date: '2026-11-11', contributionCount: 1 }] },
      ],
    },
    commitContributionsByRepository: [
      { contributions: { totalCount: 30 }, repository: repo('rails/rails', 50000) },
      { contributions: { totalCount: 10 }, repository: repo('octocat/hello', 900) },
    ],
    pullRequestContributionsByRepository: [{ contributions: { totalCount: 7 }, repository: repo('rails/rails', 50000) }],
  },
  repositories: {
    nodes: [
      { ...repo('octocat/hello', 900), createdAt: '2019-03-01T00:00:00Z' },
      { ...repo('octocat/spoon', 100), createdAt: '2019-06-01T00:00:00Z' },
      { ...repo('octocat/knife', 4), createdAt: '2021-01-01T00:00:00Z' },
      null,
    ],
  },
  issueComments: { nodes: [{ body: 'Thanks, this is awesome!' }, null] },
  pullRequests: { nodes: [{ title: 'Fix crash in parser' }] },
  issues: { nodes: [] },
}

describe('pickNetworkRepos', () => {
  it('puts the most-contributed external repos first, then own top repos, without duplicates', () => {
    const picks = pickNetworkRepos(user)
    expect(picks.map((p) => [p.nameWithOwner, p.external, p.contributions])).toEqual([
      ['rails/rails', true, 37],
      ['octocat/hello', false, 10],
      ['octocat/spoon', false, 1],
      ['octocat/knife', false, 1],
    ])
  })
})

describe('composeReport', () => {
  const contributors = new Map([
    ['rails/rails', [{ login: 'dhh', avatarUrl: avatar('dhh'), contributions: 900 }, { login: 'amy', avatarUrl: avatar('amy'), contributions: 5 }]],
    ['octocat/hello', [{ login: 'amy', avatarUrl: avatar('amy'), contributions: 20 }]],
  ])
  const report = composeReport(user, contributors, NOW)

  it('produces a document the browser schema accepts (contract test)', () => {
    expect(reportSchema.safeParse(JSON.parse(JSON.stringify(report))).success).toBe(true)
  })
  it('flattens the calendar oldest-first', () => {
    expect(report.calendar).toEqual({ start: '2026-11-08', counts: [0, 5, 12, 1] })
    expect(report.totals).toEqual({ contributions: 52, commits: 40, pullRequests: 7, issues: 3, reviews: 2 })
  })
  it('groups owned repositories by creation year', () => {
    expect(report.starsByYear).toEqual([
      { year: 2019, repos: 2, stars: 1000 },
      { year: 2021, repos: 1, stars: 4 },
    ])
  })
  it('ranks co-contributors by shared repositories first', () => {
    expect(report.collaboration.topCoContributors.map((c) => [c.login, c.sharedRepos])).toEqual([['amy', 2], ['dhh', 1]])
  })
  it('analyses sentiment from comments and titles without leaking raw text', () => {
    expect(report.sentiment.sampleSize).toBe(2)
    expect(JSON.stringify(report)).not.toContain('this is awesome')
  })
})

function gqlResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

describe('buildReport', () => {
  const contribRows = [
    { login: 'octocat', avatar_url: avatar('o'), contributions: 99, type: 'User' }, // the user themself
    { login: 'ci-bot[bot]', avatar_url: avatar('b'), contributions: 50, type: 'Bot' },
    { login: 'dhh', avatar_url: avatar('dhh'), contributions: 10, type: 'User' },
  ]

  it('sends one fixed GraphQL query and filters the user and bots from contributors', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/graphql') ? gqlResponse({ data: { user } }) : gqlResponse(contribRows),
    )
    const report = await buildReport('octocat', { token: 'T', fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW })

    const graphql = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/graphql')) as unknown as [string, RequestInit]
    const sent = JSON.parse(graphql[1].body as string) as { query: string; variables: Record<string, string> }
    expect(sent.query).toContain('DevExploreReport')
    expect(sent.variables.login).toBe('octocat')
    expect((graphql[1].headers as Record<string, string>).Authorization).toBe('Bearer T')
    expect(report.collaboration.repos[0]?.contributors.map((c) => c.login)).toEqual(['dhh'])
  })

  it('tolerates a failing contributors lookup', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/graphql') ? gqlResponse({ data: { user } }) : new Response('nope', { status: 500 }),
    )
    const report = await buildReport('octocat', { token: 'T', fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW })
    expect(report.collaboration.repos.every((r) => r.contributors.length === 0)).toBe(true)
  })

  const run = (response: Response | Error) =>
    buildReport('octocat', {
      token: 'T',
      now: () => NOW,
      fetchImpl: (async () => {
        if (response instanceof Error) throw response
        return response
      }) as unknown as typeof fetch,
    })

  it('maps GitHub failures to safe errors', async () => {
    await expect(run(gqlResponse({ data: { user: null }, errors: [{ type: 'NOT_FOUND' }] }))).rejects.toMatchObject({ status: 404 })
    await expect(run(gqlResponse({ errors: [{ type: 'RATE_LIMITED' }] }))).rejects.toMatchObject({ status: 429 })
    await expect(run(new Response('', { status: 401 }))).rejects.toMatchObject({ status: 502 })
    await expect(run(new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '123' } }))).rejects.toMatchObject({
      status: 429,
      headers: { 'x-ratelimit-reset': '123' },
    })
    await expect(run(new Error('offline'))).rejects.toBeInstanceOf(ReportError)
  })
})

describe('REPORT_QUERY', () => {
  // GitHub rejects malformed GraphQL with no `data`, and mocked responses can never reveal that.
  it('is structurally well formed (balanced braces and parentheses)', () => {
    for (const [open, close] of [['{', '}'], ['(', ')']] as const) {
      expect(REPORT_QUERY.split(open).length).toBe(REPORT_QUERY.split(close).length)
    }
    expect(REPORT_QUERY.trim().endsWith('}')).toBe(true)
  })
})

describe('buildReport error detail', () => {
  it('passes GitHub\'s error message through when no user comes back', async () => {
    const fetchImpl = (async () =>
      gqlResponse({ errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by personal access token' }] })) as unknown as typeof fetch
    await expect(buildReport('octocat', { token: 'T', fetchImpl, now: () => NOW })).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('Resource not accessible'),
    })
  })
})
