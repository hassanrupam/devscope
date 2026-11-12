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
  return { fetchMock, github: createGitHubClient(fetchMock as unknown as typeof fetch, 'https://api.test') }
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

