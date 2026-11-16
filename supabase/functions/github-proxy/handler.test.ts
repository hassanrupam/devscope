import { describe, expect, it, vi } from 'vitest'
import { handleRequest } from './handler'

const BASE = 'https://proj.supabase.co/functions/v1/github-proxy'
const TOKEN = 'github_pat_SECRET_VALUE'

function upstreamResponse(body: unknown = { login: 'octocat' }, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-ratelimit-limit': '5000', ...init.headers },
    ...init,
  })
}

function setup(env: Parameters<typeof handleRequest>[1] = { githubToken: TOKEN }, upstream: Response | Error = upstreamResponse()) {
  const fetchMock = vi.fn(async () => {
    if (upstream instanceof Error) throw upstream
    return upstream
  })
  const call = (path: string, init?: RequestInit) =>
    handleRequest(new Request(`${BASE}${path}`, init), env, fetchMock as unknown as typeof fetch)
  return { call, fetchMock }
}

const upstreamCall = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls[0] as unknown as [string, RequestInit]

describe('github-proxy handler', () => {
  it('forwards a profile request with the server-side token', async () => {
    const { call, fetchMock } = setup()
    const response = await call('/users/octocat')

    const [url, init] = upstreamCall(fetchMock)
    expect(url).toBe('https://api.github.com/users/octocat')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ login: 'octocat' })
  })

  it('marks every response so the app can detect a missing function', async () => {
    const { call } = setup()
    expect((await call('/users/octocat')).headers.get('x-devscope-proxy')).toBe('1')
    expect((await call('/nope')).headers.get('x-devscope-proxy')).toBe('1')
    expect((await call('/users/octocat', { method: 'OPTIONS' })).headers.get('x-devscope-proxy')).toBe('1')
  })

  it('never leaks the token to the browser', async () => {
    const { call } = setup()
    const response = await call('/users/octocat')
    const dump = JSON.stringify([...response.headers.entries()]) + (await response.text())
    expect(dump).not.toContain(TOKEN)
  })

  it('forwards a repositories request with a fixed query', async () => {
    const { call, fetchMock } = setup()
    await call('/users/octocat/repos?per_page=1&sort=created&type=all&page=9')

    const url = new URL(upstreamCall(fetchMock)[0])
    expect(url.origin + url.pathname).toBe('https://api.github.com/users/octocat/repos')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      per_page: '100',
      sort: 'pushed',
      direction: 'desc',
      type: 'owner',
    })
  })

  it('builds a fixed search query and caps per_page', async () => {
    const { call, fetchMock } = setup()
    await call(`/search/users?q=${encodeURIComponent('tor in:login')}&per_page=500&sort=repositories&order=asc&extra=1`)

    const url = new URL(upstreamCall(fetchMock)[0])
    expect(url.origin + url.pathname).toBe('https://api.github.com/search/users')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'tor in:login',
      per_page: '30',
      sort: 'followers',
      order: 'desc',
    })
  })

  describe('private rate-limit endpoint', () => {
    const env = {
      githubToken: TOKEN,
      rateLimitUsername: 'dashboard',
      rateLimitPassword: 'local-secret',
      supabaseUrl: 'https://proj.supabase.co',
      supabaseServiceRoleKey: 'service-role-secret',
    }
    const authorization = `Basic ${btoa('dashboard:local-secret')}`

    it('exchanges valid credentials for an expiring dashboard session', async () => {
      const { call, fetchMock } = setup(env)
      const response = await call('/rate_limit/session', { method: 'POST', headers: { authorization } })
      const session = await response.json() as { token: string; expires_at: string }

      expect(response.status).toBe(200)
      expect(session.token).toContain('.')
      expect(Date.parse(session.expires_at) - Date.now()).toBeGreaterThan(11 * 60 * 60 * 1000)
      expect(JSON.stringify(session)).not.toContain('local-secret')
      expect(fetchMock).not.toHaveBeenCalled()

      const protectedResponse = await call('/rate_limit', {
        headers: { authorization: `Bearer ${session.token}` },
      })
      expect(protectedResponse.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('rejects a tampered dashboard session before calling GitHub', async () => {
      const { call, fetchMock } = setup(env)
      const response = await call('/rate_limit', {
        headers: { authorization: 'Bearer eyJzdWIiOiJkYXNoYm9hcmQifQ.invalid' },
      })

      expect(response.status).toBe(401)
      expect(response.headers.get('x-devscope-rate-limit-error')).toBe('unauthorized')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('requires dashboard credentials before making an upstream request', async () => {
      const { call, fetchMock } = setup(env)
      const response = await call('/rate_limit')

      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toContain('Basic')
      expect(response.headers.get('x-devscope-rate-limit-error')).toBe('unauthorized')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('does not forward rate-limit requests with incorrect credentials', async () => {
      const { call, fetchMock } = setup(env)
      const response = await call('/rate_limit', { headers: { authorization: `Basic ${btoa('dashboard:wrong')}` } })

      expect(response.status).toBe(401)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fails closed when dashboard credentials are not configured', async () => {
      const { call, fetchMock } = setup({ githubToken: TOKEN })
      const response = await call('/rate_limit', { headers: { authorization } })

      expect(response.status).toBe(503)
      expect(response.headers.get('x-devscope-rate-limit-error')).toBe('not_configured')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fetches only GitHub rate_limit and keeps the token server-side', async () => {
      const body = {
        resources: { core: { limit: 5000, used: 4, remaining: 4996, reset: 1794812414 } },
        rate: { limit: 5000, used: 4, remaining: 4996, reset: 1794812414 },
      }
      const { call, fetchMock } = setup(env, upstreamResponse(body))
      const response = await call('/rate_limit', { headers: { authorization } })
      const [url, init] = upstreamCall(fetchMock)

      expect(url).toBe('https://api.github.com/rate_limit')
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
      expect(response.status).toBe(200)
      const responseBody = await response.text()
      expect(JSON.parse(responseBody)).toEqual(body)
      expect(responseBody).not.toContain(TOKEN)
    })

    it('allows the browser to send Basic credentials in CORS preflight', async () => {
      const { call } = setup({})
      const response = await call('/rate_limit', {
        method: 'OPTIONS',
        headers: { 'access-control-request-headers': 'authorization' },
      })

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
    })

    it('stores a half-hour snapshot and removes records older than ten days', async () => {
      const body = {
        resources: { core: { limit: 5000, used: 4, remaining: 4996, reset: 1794812414 } },
        rate: { limit: 5000, used: 4, remaining: 4996, reset: 1794812414 },
      }
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === 'https://api.github.com/rate_limit') return upstreamResponse(body)
        if (init?.method === 'POST') return new Response(null, { status: 201 })
        if (init?.method === 'DELETE') return new Response(null, { status: 204 })
        throw new Error(`Unexpected request: ${String(input)}`)
      })
      const response = await handleRequest(
        new Request(`${BASE}/rate_limit/snapshot`, { method: 'POST', headers: { authorization } }),
        env,
        fetchMock as unknown as typeof fetch,
      )

      expect(response.status).toBe(200)
      const githubRequest = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
      expect(String(githubRequest[0])).toBe('https://api.github.com/rate_limit')
      expect((githubRequest[1].headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)

      const insert = fetchMock.mock.calls[1] as unknown as [RequestInfo | URL, RequestInit]
      expect(String(insert[0])).toContain('/rest/v1/rate_limit_snapshots?on_conflict=captured_at')
      expect((insert[1].headers as Headers).get('authorization')).toBe('Bearer service-role-secret')
      expect(JSON.parse(String(insert[1].body))[0].payload).toEqual(body)
      const capturedAt = JSON.parse(String(insert[1].body))[0].captured_at
      expect(Date.parse(capturedAt) % (30 * 60 * 1000)).toBe(0)

      const prune = fetchMock.mock.calls[2] as unknown as [RequestInfo | URL, RequestInit]
      expect(prune[1].method).toBe('DELETE')
      expect(String(prune[0])).toContain('captured_at=lt.')
    })

    it('requires dashboard credentials before a scheduled snapshot can make requests', async () => {
      const { call, fetchMock } = setup(env)
      const response = await call('/rate_limit/snapshot', { method: 'POST' })

      expect(response.status).toBe(401)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns only the last ten days of authenticated snapshot history', async () => {
      const snapshots = [{
        captured_at: '2026-11-16T12:30:00+00:00',
        payload: {
          resources: { core: { limit: 5000, used: 4, remaining: 4996, reset: 1794812414 } },
          rate: { limit: 5000, used: 4, remaining: 4996, reset: 1794812414 },
        },
      }]
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(snapshots), { status: 200 }))
      const response = await handleRequest(
        new Request(`${BASE}/rate_limit/history`, { headers: { authorization } }),
        env,
        fetchMock as unknown as typeof fetch,
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(snapshots)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const query = new URL(url).searchParams
      expect(new URL(url).pathname).toBe('/rest/v1/rate_limit_snapshots')
      expect(query.get('select')).toBe('captured_at,payload')
      expect(query.get('order')).toBe('captured_at.asc')
      expect(query.get('limit')).toBe('480')
      expect(query.get('captured_at')).toMatch(/^gte\./)
      expect((init.headers as Headers).get('authorization')).toBe('Bearer service-role-secret')
    })
  })

  it.each([
    ['/users/bad name', 400],
    ['/users/-leading', 400],
    ['/users/a%2Fb', 400],
    ['/users/%E0%A4%A', 400],
    [`/search/users?q=${encodeURIComponent('tor in:email')}`, 400],
    [`/search/users?q=${encodeURIComponent('org:github in:login')}`, 400],
    ['/search/users', 400],
    ['/users/bad name/repos', 400],
    ['/users/octocat/repos/extra', 404],
    ['/users/octocat/starred', 404],
    ['/repos/octocat/hello', 404],
    ['/user', 404],
    ['/', 404],
  ])('rejects %s without calling GitHub', async (path, status) => {
    const { call, fetchMock } = setup()
    const response = await call(path)
    expect(response.status).toBe(status)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('only allows GET', async () => {
    const { call, fetchMock } = setup()
    const response = await call('/users/octocat', { method: 'POST', body: '{}' })
    expect(response.status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes through upstream status and rate-limit headers', async () => {
    const { call } = setup(
      { githubToken: TOKEN },
      upstreamResponse({ message: 'rate limited' }, { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' } }),
    )
    const response = await call('/users/octocat')
    expect(response.status).toBe(403)
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0')
    expect(response.headers.get('x-ratelimit-reset')).toBe('1800000000')
    expect(response.headers.get('access-control-expose-headers')).toContain('x-ratelimit-remaining')
  })

  it('passes a GitHub 404 through', async () => {
    const { call } = setup({ githubToken: TOKEN }, upstreamResponse({ message: 'Not Found' }, { status: 404 }))
    expect((await call('/users/ghost')).status).toBe(404)
  })

  it('answers CORS preflight without needing a token or calling GitHub', async () => {
    const { call, fetchMock } = setup({})
    const response = await call('/users/octocat', { method: 'OPTIONS' })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 500 when no token is configured', async () => {
    const { call, fetchMock } = setup({})
    const response = await call('/users/octocat')
    expect(response.status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 502 when GitHub cannot be reached', async () => {
    const { call } = setup({ githubToken: TOKEN }, new TypeError('network down'))
    expect((await call('/users/octocat')).status).toBe(502)
  })

  describe('ALLOWED_ORIGINS', () => {
    const env = { githubToken: TOKEN, allowedOrigins: 'https://app.vercel.app, http://localhost:5173/' }

    it('allows a listed origin and echoes it', async () => {
      const { call } = setup(env)
      const response = await call('/users/octocat', { headers: { origin: 'https://app.vercel.app' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.vercel.app')
    })

    it('tolerates a trailing slash in the configured list', async () => {
      const { call } = setup(env)
      const response = await call('/users/octocat', { headers: { origin: 'http://localhost:5173' } })
      expect(response.status).toBe(200)
    })

    it('rejects other origins before calling GitHub', async () => {
      const { call, fetchMock } = setup(env)
      const response = await call('/users/octocat', { headers: { origin: 'https://evil.example' } })
      expect(response.status).toBe(403)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
