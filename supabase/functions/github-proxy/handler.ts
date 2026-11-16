/**
 * GitHub proxy: adds the server-side GitHub token to a tiny allowlist of read-only requests.
 *
 * This file is plain Web-standard TypeScript (no Deno APIs) so that it can be unit-tested
 * with Vitest. `index.ts` wires it to Deno.serve and the real environment.
 *
 * It is deliberately NOT an open proxy. Only these upstream requests are possible:
 *   GET /users/{username}
 *   GET /users/{username}/repos   (per_page, sort, direction and type are fixed)
 *   GET /users/{username}/report  (one fixed GraphQL query + a few contributor lookups; see report.ts)
 *   GET /search/users?q={prefix} in:login[&per_page=1..30]   (sort/order are fixed)
 */
import { buildReport, ReportError } from './report.ts'

export interface ProxyEnv {
  /** GitHub personal access token. Lives only in Supabase secrets, never in the browser. */
  githubToken?: string
  /** Optional comma-separated list of browser origins allowed to call the proxy. Empty = any. */
  allowedOrigins?: string
}

const GITHUB_API = 'https://api.github.com'
const FUNCTION_PREFIX = '/github-proxy'
const USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const SEARCH_QUERY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38} in:login$/
const SEARCH_MAX_PER_PAGE = 30
// Legacy name from before the DevExplore rebrand, kept so an already-deployed function and a newer app agree.
export const PROXY_MARKER_HEADER = 'x-devscope-proxy'

/** Rate-limit headers the browser client needs to produce a helpful error. */
const FORWARDED_HEADERS = [
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-resource',
  'retry-after',
]

function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

function corsHeaders(allowedOrigins: string[], origin: string | null): Headers {
  const headers = new Headers()
  if (allowedOrigins.length === 0) {
    headers.set('access-control-allow-origin', '*')
  } else if (origin && allowedOrigins.includes(origin)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('vary', 'Origin')
  }
  headers.set('access-control-allow-methods', 'GET, OPTIONS')
  headers.set('access-control-allow-headers', 'accept, content-type')
  headers.set('access-control-expose-headers', [...FORWARDED_HEADERS, PROXY_MARKER_HEADER].join(', '))
  // Lets the app tell "GitHub said 404" apart from "the function itself is missing" (platform 404).
  headers.set(PROXY_MARKER_HEADER, '1')
  headers.set('access-control-max-age', '86400')
  return headers
}

function errorResponse(status: number, message: string, cors: Headers): Response {
  const headers = new Headers(cors)
  headers.set('content-type', 'application/json')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify({ message }), { status, headers })
}

/** The request path relative to the function (works behind Supabase's `/functions/v1/github-proxy` prefix). */
function routePath(url: URL): string {
  const index = url.pathname.indexOf(FUNCTION_PREFIX)
  return (index >= 0 ? url.pathname.slice(index + FUNCTION_PREFIX.length) : url.pathname).replace(/\/+$/, '')
}

/** Maps the incoming request to an allowed upstream GitHub URL, or an error message. */
function resolveUpstream(url: URL): { upstream: string } | { error: string; status: number } {
  const path = routePath(url)

  const userMatch = /^\/users\/([^/]+)$/.exec(path)
  const reposMatch = /^\/users\/([^/]+)\/repos$/.exec(path)
  const segment = userMatch?.[1] ?? reposMatch?.[1]
  if (segment !== undefined) {
    let username: string
    try {
      username = decodeURIComponent(segment)
    } catch {
      return { error: 'Invalid username', status: 400 }
    }
    if (!USERNAME.test(username)) return { error: 'Invalid username', status: 400 }
    const encoded = encodeURIComponent(username)
    if (reposMatch) {
      const params = new URLSearchParams({ per_page: '100', sort: 'pushed', direction: 'desc', type: 'owner' })
      return { upstream: `${GITHUB_API}/users/${encoded}/repos?${params.toString()}` }
    }
    return { upstream: `${GITHUB_API}/users/${encoded}` }
  }

  if (path === '/search/users') {
    const q = url.searchParams.get('q') ?? ''
    if (!SEARCH_QUERY.test(q)) return { error: 'Invalid search query', status: 400 }
    const requested = Number(url.searchParams.get('per_page') ?? SEARCH_MAX_PER_PAGE)
    const perPage = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), SEARCH_MAX_PER_PAGE) : SEARCH_MAX_PER_PAGE
    const params = new URLSearchParams({ q, per_page: String(perPage), sort: 'followers', order: 'desc' })
    return { upstream: `${GITHUB_API}/search/users?${params.toString()}` }
  }

  return { error: 'Not found', status: 404 }
}

export async function handleRequest(
  request: Request,
  env: ProxyEnv,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<Response> {
  const allowedOrigins = parseAllowedOrigins(env.allowedOrigins)
  const origin = request.headers.get('origin')?.replace(/\/$/, '') ?? null
  const cors = corsHeaders(allowedOrigins, origin)

  // Browsers always send Origin on cross-origin requests; refuse origins that are not allowed.
  if (allowedOrigins.length > 0 && origin !== null && !allowedOrigins.includes(origin)) {
    return errorResponse(403, 'Origin not allowed', cors)
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'GET') return errorResponse(405, 'Method not allowed', cors)

  if (!env.githubToken) return errorResponse(500, 'Proxy is not configured', cors)

  const requestUrl = new URL(request.url)
  const reportMatch = /^\/users\/([^/]+)\/report$/.exec(routePath(requestUrl))
  if (reportMatch) return handleReport(reportMatch[1] ?? '', env.githubToken, cors, fetchImpl)

  const resolved = resolveUpstream(requestUrl)
  if ('error' in resolved) return errorResponse(resolved.status, resolved.error, cors)

  let upstream: Response
  try {
    upstream = await fetchImpl(resolved.upstream, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.githubToken}`,
        'User-Agent': 'devexplore-github-proxy',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  } catch {
    return errorResponse(502, 'Could not reach GitHub', cors)
  }

  const headers = new Headers(cors)
  headers.set('content-type', upstream.headers.get('content-type') ?? 'application/json')
  headers.set('cache-control', 'no-store')
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return new Response(await upstream.text(), { status: upstream.status, headers })
}

async function handleReport(
  rawUsername: string,
  token: string,
  cors: Headers,
  fetchImpl: typeof fetch,
): Promise<Response> {
  let username: string
  try {
    username = decodeURIComponent(rawUsername)
  } catch {
    return errorResponse(400, 'Invalid username', cors)
  }
  if (!USERNAME.test(username)) return errorResponse(400, 'Invalid username', cors)

  try {
    const report = await buildReport(username, { token, fetchImpl })
    const headers = new Headers(cors)
    headers.set('content-type', 'application/json')
    headers.set('cache-control', 'no-store')
    return new Response(JSON.stringify(report), { status: 200, headers })
  } catch (error) {
    if (error instanceof ReportError) {
      const response = errorResponse(error.status, error.message, cors)
      for (const [name, value] of Object.entries(error.headers)) response.headers.set(name, value)
      return response
    }
    return errorResponse(502, 'Could not build the report', cors)
  }
}
