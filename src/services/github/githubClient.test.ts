import { describe, expect, it, vi } from 'vitest'
import { createGitHubClient } from './githubClient'

const validBody = {
  id: 1,
  login: 'Octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  html_url: 'https://github.com/octocat',
  name: 'The Octocat',
  bio: null,
  company: '   ',
  location: 'SF',
  blog: '',
  public_repos: 8,
  followers: 10,
  following: 2,
  created_at: '2011-01-25T18:44:36Z',
  some_unknown_field: 'dropped',
}

function client(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return { fetchMock, github: createGitHubClient(fetchMock as unknown as typeof fetch, 'https://api.test', false) }
}

describe('githubClient.fetchProfile', () => {
  it('parses a valid profile, normalises empty fields and drops unknown fields', async () => {
    const { github, fetchMock } = client(Response.json(validBody))
    const profile = await github.fetchProfile('octocat')

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/users/octocat', expect.anything())
    expect(profile.login).toBe('Octocat')
    expect(profile.bio).toBeNull()
    expect(profile.company).toBeNull()
    expect(profile.blog).toBeNull()
    expect(profile).not.toHaveProperty('some_unknown_field')
  })

  it('maps 404 to not_found', async () => {
    const { github } = client(new Response('{}', { status: 404 }))
    await expect(github.fetchProfile('ghost')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('maps 403 with no remaining quota to rate_limited with a reset time', async () => {
    const { github } = client(
      new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' } }),
    )
    await expect(github.fetchProfile('a')).rejects.toMatchObject({
      code: 'rate_limited',
      resetAt: new Date(1800000000 * 1000),
    })
  })

  it('maps 429 to rate_limited', async () => {
    const { github } = client(new Response('{}', { status: 429 }))
    await expect(github.fetchProfile('a')).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('treats other 403s as upstream errors, not rate limits', async () => {
    const { github } = client(new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '12' } }))
    await expect(github.fetchProfile('a')).rejects.toMatchObject({ code: 'upstream' })
  })

  it('maps 5xx to upstream', async () => {
    const { github } = client(new Response('oops', { status: 502 }))
    await expect(github.fetchProfile('a')).rejects.toMatchObject({ code: 'upstream' })
  })

  it('maps fetch failures to network and hides the raw error', async () => {
    const { github } = client(new TypeError('Failed to fetch'))
    const error = await github.fetchProfile('a').catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'network' })
    expect((error as Error).message).not.toContain('Failed to fetch')
  })

  it('rejects malformed payloads', async () => {
    const { github } = client(Response.json({ login: 'x' }))
    await expect(github.fetchProfile('x')).rejects.toMatchObject({ code: 'upstream' })
  })

  it('rejects non-http avatar URLs', async () => {
    const { github } = client(Response.json({ ...validBody, avatar_url: 'javascript:alert(1)' }))
    await expect(github.fetchProfile('octocat')).rejects.toMatchObject({ code: 'upstream' })
  })
})

describe('githubClient.searchUsersByPrefix', () => {
  const item = (id: number, login: string) => ({
    id,
    login,
    type: 'User',
    avatar_url: `https://avatars.githubusercontent.com/u/${id}`,
    html_url: `https://github.com/${login}`,
    score: 1,
  })

  it('queries by login, keeps only prefix matches and drops unknown fields', async () => {
    const { github, fetchMock } = client(
      Response.json({ items: [item(1, 'torvalds'), item(2, 'victor'), item(3, 'Tor-Project'), item(4, 'ontor')] }),
    )
    const users = await github.searchUsersByPrefix('tor')

    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0])
    expect(url.pathname).toBe('/search/users')
    expect(url.searchParams.get('q')).toBe('tor in:login')
    expect(users.map((u) => u.login)).toEqual(['torvalds', 'Tor-Project'])
    expect(users[0]).not.toHaveProperty('score')
  })

  it('limits the number of results', async () => {
    const items = Array.from({ length: 30 }, (_, i) => item(i + 1, `tor${i}`))
    const { github } = client(Response.json({ items }))
    expect(await github.searchUsersByPrefix('tor')).toHaveLength(12)
  })

  it('returns an empty list when nothing matches', async () => {
    const { github } = client(Response.json({ items: [] }))
    expect(await github.searchUsersByPrefix('zzzz')).toEqual([])
  })

  it('maps search rate limiting to rate_limited', async () => {
    const { github } = client(new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }))
    await expect(github.searchUsersByPrefix('tor')).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('maps GitHub validation errors (422) to upstream', async () => {
    const { github } = client(new Response('{}', { status: 422 }))
    await expect(github.searchUsersByPrefix('tor')).rejects.toMatchObject({ code: 'upstream' })
  })

  it('rejects malformed search payloads', async () => {
    const { github } = client(Response.json({ items: [{ login: 'x' }] }))
    await expect(github.searchUsersByPrefix('x')).rejects.toMatchObject({ code: 'upstream' })
  })
})


describe('githubClient with the token proxy base URL', () => {
  it('sends profile and search requests to the proxy, with only the Accept header', async () => {
    const proxyBase = 'https://proj.supabase.co/functions/v1/github-proxy'
    const fetchMock = vi.fn(async () => Response.json({ items: [] }))
    const github = createGitHubClient(fetchMock as unknown as typeof fetch, proxyBase)

    await github.searchUsersByPrefix('tor')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url.startsWith(`${proxyBase}/search/users?`)).toBe(true)
    expect(init.headers).toEqual({ Accept: 'application/vnd.github+json' })
  })

  it('treats a 404 without the proxy marker as an upstream problem, not "user not found"', async () => {
    const fetchMock = vi.fn(async () => new Response('{"code":"NOT_FOUND"}', { status: 404 }))
    const github = createGitHubClient(fetchMock as unknown as typeof fetch, 'https://p.test/github-proxy', true)
    await expect(github.fetchProfile('octocat')).rejects.toMatchObject({ code: 'upstream' })
  })

  it('still maps a 404 coming from the proxy (GitHub said so) to not_found', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 404, headers: { 'x-devscope-proxy': '1' } }))
    const github = createGitHubClient(fetchMock as unknown as typeof fetch, 'https://p.test/github-proxy', true)
    await expect(github.fetchProfile('ghost')).rejects.toMatchObject({ code: 'not_found' })
  })
})


describe('githubClient.fetchRepos', () => {
  const repoItem = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    name: `repo-${id}`,
    html_url: `https://github.com/octocat/repo-${id}`,
    description: '  A repo  ',
    language: 'TypeScript',
    stargazers_count: 7,
    forks_count: 2,
    fork: false,
    archived: false,
    pushed_at: '2026-01-01T00:00:00Z',
    owner: { login: 'octocat' },
    ...extra,
  })

  it('requests the user\'s own repos, most recently pushed first, in one request', async () => {
    const { github, fetchMock } = client(Response.json([repoItem(1)]))
    await github.fetchRepos('octocat')

    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0])
    expect(url.pathname).toBe('/users/octocat/repos')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      per_page: '100',
      sort: 'pushed',
      direction: 'desc',
      type: 'owner',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps only the fields it uses and normalises text', async () => {
    const { github } = client(Response.json([repoItem(1, { description: '   ', language: null })]))
    const [repo] = await github.fetchRepos('octocat')
    expect(repo).toEqual({
      id: 1,
      name: 'repo-1',
      html_url: 'https://github.com/octocat/repo-1',
      description: null,
      language: null,
      stargazers_count: 7,
      forks_count: 2,
      fork: false,
      archived: false,
      pushed_at: '2026-01-01T00:00:00Z',
    })
  })

  it('truncates long descriptions to 200 characters', async () => {
    const { github } = client(Response.json([repoItem(1, { description: 'x'.repeat(500) })]))
    const [repo] = await github.fetchRepos('octocat')
    expect(repo?.description).toHaveLength(200)
  })

  it('skips malformed repositories instead of failing the whole list', async () => {
    const { github } = client(Response.json([repoItem(1), { id: 'nope' }, repoItem(3, { html_url: 'javascript:alert(1)' }), repoItem(4)]))
    const repos = await github.fetchRepos('octocat')
    expect(repos.map((r) => r.id)).toEqual([1, 4])
  })

  it('returns an empty list for a user without repositories', async () => {
    const { github } = client(Response.json([]))
    expect(await github.fetchRepos('newbie')).toEqual([])
  })

  it('maps 404 to not_found and rate limits to rate_limited', async () => {
    await expect(client(new Response('{}', { status: 404 })).github.fetchRepos('ghost')).rejects.toMatchObject({ code: 'not_found' })
    await expect(
      client(new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })).github.fetchRepos('a'),
    ).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('rejects a non-array payload', async () => {
    const { github } = client(Response.json({ message: 'weird' }))
    await expect(github.fetchRepos('octocat')).rejects.toMatchObject({ code: 'upstream' })
  })

  it('treats a 404 without the proxy marker as a missing proxy, not "user not found"', async () => {
    const fetchMock = vi.fn(async () => new Response('{"code":"NOT_FOUND"}', { status: 404 }))
    const github = createGitHubClient(fetchMock as unknown as typeof fetch, 'https://p.test/github-proxy', true)
    await expect(github.fetchRepos('octocat')).rejects.toMatchObject({ code: 'upstream' })
  })
})

describe('githubClient.fetchReport', () => {
  const validReport = {
    login: 'octocat',
    generatedAt: '2026-11-16T00:00:00Z',
    calendar: { start: '2026-11-01', counts: [1, 0, 2] },
    totals: { contributions: 3, commits: 3, pullRequests: 0, issues: 0, reviews: 0 },
    starsByYear: [{ year: 2020, repos: 1, stars: 3 }],
    collaboration: { repos: [], topCoContributors: [] },
    sentiment: { score: 0.2, sampleSize: 3, words: [{ text: 'cache', count: 2, tone: 0 }] },
  }
  const proxied = (response: Response) => {
    const fetchMock = vi.fn(async () => response)
    return { fetchMock, github: createGitHubClient(fetchMock as unknown as typeof fetch, 'https://proxy.test', true) }
  }

  it('fetches and validates the report through the proxy', async () => {
    const { github, fetchMock } = proxied(new Response(JSON.stringify(validReport), { headers: { 'x-devscope-proxy': '1' } }))
    await expect(github.fetchReport('octocat')).resolves.toMatchObject({ login: 'octocat' })
    expect(fetchMock).toHaveBeenCalledWith('https://proxy.test/users/octocat/report', expect.anything())
  })

  it('is unavailable without the proxy (GraphQL needs a token)', async () => {
    const { github, fetchMock } = client(new Response('{}'))
    await expect(github.fetchReport('octocat')).rejects.toMatchObject({ code: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps an unknown user to not_found and a malformed report to upstream', async () => {
    await expect(
      proxied(new Response('{}', { status: 404, headers: { 'x-devscope-proxy': '1' } })).github.fetchReport('ghost'),
    ).rejects.toMatchObject({ code: 'not_found' })
    await expect(
      proxied(new Response(JSON.stringify({ login: 'octocat' }), { headers: { 'x-devscope-proxy': '1' } })).github.fetchReport('octocat'),
    ).rejects.toMatchObject({ code: 'upstream' })
  })
})
