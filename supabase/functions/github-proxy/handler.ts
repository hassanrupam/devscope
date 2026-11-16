/**
 * GitHub proxy: adds the server-side GitHub token to a tiny allowlist of read-only requests.
 *
 * This file is plain Web-standard TypeScript (no Deno APIs, no imports) so that it can be unit-tested
 * with Vitest. `index.ts` wires it to Deno.serve and the real environment.
 *
 * It is deliberately NOT an open proxy. Only these upstream requests are possible:
 *   GET /users/{username}
 *   GET /users/{username}/repos   (per_page, sort, direction and type are fixed)
 *   GET /search/users?q={prefix} in:login[&per_page=1..30]   (sort/order are fixed)
 *   POST /rate_limit/session (exchanges dashboard credentials for a short-lived signed session)
 *   GET /rate_limit and GET /rate_limit/history (require dashboard authentication)
 *   POST /rate_limit/snapshot (requires dashboard Basic credentials; called by Supabase Cron)
 */

export interface ProxyEnv {
  /** GitHub personal access token. Lives only in Supabase secrets, never in the browser. */
  githubToken?: string
  /** Optional comma-separated list of browser origins allowed to call the proxy. Empty = any. */
  allowedOrigins?: string
  /** Credentials required for the private rate-limit dashboard. */
  rateLimitUsername?: string
  rateLimitPassword?: string
  /** Supabase service role credentials used only to persist/read private snapshots. */
  supabaseUrl?: string
  supabaseServiceRoleKey?: string
}

function jsonResponse(status: number, body: unknown, cors: Headers): Response {
  const headers = new Headers(cors)
  headers.set('content-type', 'application/json')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

const GITHUB_API = 'https://api.github.com'
const RATE_LIMIT_SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000
const RATE_LIMIT_RETENTION_MS = 10 * 24 * 60 * 60 * 1000
const RATE_LIMIT_SESSION_LIFETIME_SECONDS = 12 * 60 * 60
const FUNCTION_PREFIX = '/github-proxy'
const USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const SEARCH_QUERY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38} in:login$/
const SEARCH_MAX_PER_PAGE = 30
// Legacy name from before the DevExplore rebrand, kept so an already-deployed function and a newer app agree.
export const PROXY_MARKER_HEADER = 'x-devscope-proxy'
const RATE_LIMIT_ERROR_HEADER = 'x-devscope-rate-limit-error'

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
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  headers.set('access-control-allow-headers', 'accept, authorization, content-type')
  headers.set(
    'access-control-expose-headers',
    [...FORWARDED_HEADERS, PROXY_MARKER_HEADER, RATE_LIMIT_ERROR_HEADER].join(', '),
  )
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

function unauthorizedResponse(cors: Headers): Response {
  const response = errorResponse(401, 'Dashboard username or password is incorrect', cors)
  const headers = new Headers(response.headers)
  headers.set('www-authenticate', 'Basic realm="DevExplore rate limits", charset="UTF-8"')
  headers.set(RATE_LIMIT_ERROR_HEADER, 'unauthorized')
  return new Response(response.body, { status: response.status, headers })
}

function dashboardNotConfiguredResponse(cors: Headers): Response {
  const response = errorResponse(503, 'Rate-limit dashboard authentication is not configured', cors)
  const headers = new Headers(response.headers)
  headers.set(RATE_LIMIT_ERROR_HEADER, 'not_configured')
  return new Response(response.body, { status: response.status, headers })
}

function decodeBasicCredentials(header: string | null): { username: string; password: string } | null {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header ?? '')
  const encoded = match?.[1]
  if (!encoded || encoded.length > 4096) return null

  try {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const separator = value.indexOf(':')
    if (separator <= 0) return null
    return { username: value.slice(0, separator), password: value.slice(separator + 1) }
  } catch {
    return null
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.max(leftBytes.length, rightBytes.length)
  let mismatch = leftBytes.length ^ rightBytes.length
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return mismatch === 0
}

function hasDashboardCredentials(request: Request, env: ProxyEnv): boolean {
  const credentials = decodeBasicCredentials(request.headers.get('authorization'))
  const usernameMatches = constantTimeEqual(credentials?.username ?? '', env.rateLimitUsername ?? '')
  const passwordMatches = constantTimeEqual(credentials?.password ?? '', env.rateLimitPassword ?? '')
  return Boolean(env.rateLimitUsername && env.rateLimitPassword && usernameMatches && passwordMatches)
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function signSessionPayload(payload: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload))
  return encodeBase64Url(new Uint8Array(signature))
}

async function createDashboardSession(username: string, githubToken: string): Promise<{ token: string; expires_at: string }> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const expiresAt = nowSeconds + RATE_LIMIT_SESSION_LIFETIME_SECONDS
  const payload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify({ sub: username, iat: nowSeconds, exp: expiresAt })),
  )
  // The server-only GitHub token signs sessions; rotating it invalidates existing dashboard sessions.
  const signature = await signSessionPayload(payload, githubToken)
  return {
    token: `${payload}.${signature}`,
    expires_at: new Date(expiresAt * 1000).toISOString(),
  }
}

async function hasDashboardSession(request: Request, env: ProxyEnv): Promise<boolean> {
  const match = /^Bearer ([A-Za-z0-9._-]{1,2048})$/.exec(request.headers.get('authorization') ?? '')
  const token = match?.[1]
  if (!token || !env.githubToken || !env.rateLimitUsername) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false

  const [payloadPart, signature] = parts
  if (!payloadPart || !signature) return false
  const payloadBytes = decodeBase64Url(payloadPart)
  if (!payloadBytes || !/^[A-Za-z0-9_-]+$/.test(signature)) return false

  try {
    const expectedSignature = await signSessionPayload(payloadPart, env.githubToken)
    if (!constantTimeEqual(signature, expectedSignature)) return false

    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes))
    if (typeof payload !== 'object' || payload === null) return false
    const claims = payload as Record<string, unknown>
    const nowSeconds = Math.floor(Date.now() / 1000)
    return (
      typeof claims.sub === 'string' &&
      constantTimeEqual(claims.sub, env.rateLimitUsername) &&
      Number.isInteger(claims.iat) &&
      Number.isInteger(claims.exp) &&
      (claims.iat as number) <= nowSeconds &&
      (claims.exp as number) > nowSeconds &&
      (claims.exp as number) - (claims.iat as number) === RATE_LIMIT_SESSION_LIFETIME_SECONDS
    )
  } catch {
    return false
  }
}

async function hasDashboardAuthorization(request: Request, env: ProxyEnv): Promise<boolean> {
  if (await hasDashboardSession(request, env)) return true
  return hasDashboardCredentials(request, env)
}

function getProxyPath(url: URL): string {
  const index = url.pathname.indexOf(FUNCTION_PREFIX)
  return (index >= 0 ? url.pathname.slice(index + FUNCTION_PREFIX.length) : url.pathname).replace(/\/+$/, '')
}

function isRateLimitData(value: unknown): value is {
  rate: { limit: number; used: number; remaining: number; reset: number }
  resources: Record<string, { limit: number; used: number; remaining: number; reset: number }>
} {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Record<string, unknown>
  const validResource = (resource: unknown): boolean => {
    if (typeof resource !== 'object' || resource === null) return false
    const values = resource as Record<string, unknown>
    return ['limit', 'used', 'remaining', 'reset'].every(
      (key) => Number.isInteger(values[key]) && (values[key] as number) >= 0,
    )
  }
  if (!validResource(payload.rate) || typeof payload.resources !== 'object' || payload.resources === null) return false
  return Object.values(payload.resources).every(validResource)
}

function serviceRoleHeaders(key: string): Headers {
  return new Headers({
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  })
}

async function captureRateLimitSnapshot(
  env: ProxyEnv,
  cors: Headers,
  fetchImpl: typeof fetch,
): Promise<Response> {
  if (!env.githubToken) return errorResponse(500, 'Proxy is not configured', cors)
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return errorResponse(503, 'Rate-limit snapshot storage is not configured', cors)
  }

  let upstream: Response
  try {
    upstream = await fetchImpl(`${GITHUB_API}/rate_limit`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.githubToken}`,
        'User-Agent': 'devexplore-github-proxy',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  } catch {
    return errorResponse(502, 'Could not reach GitHub for a rate-limit snapshot', cors)
  }
  if (!upstream.ok) return errorResponse(502, `GitHub rate-limit request failed (HTTP ${upstream.status})`, cors)

  let payload: unknown
  try {
    payload = await upstream.json()
  } catch {
    return errorResponse(502, 'GitHub returned unreadable rate-limit data', cors)
  }
  if (!isRateLimitData(payload)) return errorResponse(502, 'GitHub returned unexpected rate-limit data', cors)

  const capturedAt = new Date(Math.floor(Date.now() / RATE_LIMIT_SNAPSHOT_INTERVAL_MS) * RATE_LIMIT_SNAPSHOT_INTERVAL_MS)
  const timestamp = capturedAt.toISOString()
  const endpoint = `${env.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rate_limit_snapshots`
  const headers = serviceRoleHeaders(env.supabaseServiceRoleKey)
  headers.set('prefer', 'resolution=merge-duplicates,return=minimal')

  let stored: Response
  try {
    stored = await fetchImpl(`${endpoint}?on_conflict=captured_at`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ captured_at: timestamp, payload }]),
    })
  } catch {
    return errorResponse(502, 'Could not save the rate-limit snapshot', cors)
  }
  if (!stored.ok) return errorResponse(502, 'Could not save the rate-limit snapshot', cors)

  const cutoff = new Date(Date.now() - RATE_LIMIT_RETENTION_MS).toISOString()
  let pruned: Response
  try {
    pruned = await fetchImpl(`${endpoint}?captured_at=lt.${encodeURIComponent(cutoff)}`, {
      method: 'DELETE',
      headers: serviceRoleHeaders(env.supabaseServiceRoleKey),
    })
  } catch {
    return errorResponse(502, 'Could not apply rate-limit snapshot retention', cors)
  }
  if (!pruned.ok) return errorResponse(502, 'Could not apply rate-limit snapshot retention', cors)

  const headersOut = new Headers(cors)
  headersOut.set('content-type', 'application/json')
  headersOut.set('cache-control', 'no-store')
  return new Response(JSON.stringify({ captured_at: timestamp }), { status: 200, headers: headersOut })
}

async function readRateLimitHistory(
  env: ProxyEnv,
  cors: Headers,
  fetchImpl: typeof fetch,
): Promise<Response> {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return errorResponse(503, 'Rate-limit snapshot storage is not configured', cors)
  }

  const cutoff = new Date(Date.now() - RATE_LIMIT_RETENTION_MS).toISOString()
  const query = new URLSearchParams({
    select: 'captured_at,payload',
    captured_at: `gte.${cutoff}`,
    order: 'captured_at.asc',
    limit: '480',
  })
  let response: Response
  try {
    response = await fetchImpl(
      `${env.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rate_limit_snapshots?${query.toString()}`,
      { headers: serviceRoleHeaders(env.supabaseServiceRoleKey) },
    )
  } catch {
    return errorResponse(502, 'Could not load rate-limit history', cors)
  }
  if (!response.ok) return errorResponse(502, 'Could not load rate-limit history', cors)

  const headersOut = new Headers(cors)
  headersOut.set('content-type', 'application/json')
  headersOut.set('cache-control', 'no-store')
  return new Response(await response.text(), { status: 200, headers: headersOut })
}

/** Maps the incoming request to an allowed upstream GitHub URL, or an error message. */
function resolveUpstream(
  url: URL,
): { upstream: string; requiresDashboardAuth?: boolean } | { error: string; status: number } {
  const path = getProxyPath(url)

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

  if (path === '/rate_limit') {
    return { upstream: `${GITHUB_API}/rate_limit`, requiresDashboardAuth: true }
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

  const requestUrl = new URL(request.url)
  const path = getProxyPath(requestUrl)
  if (path === '/rate_limit/session') {
    if (request.method !== 'POST') return errorResponse(405, 'Method not allowed', cors)
    if (!env.rateLimitUsername || !env.rateLimitPassword) return dashboardNotConfiguredResponse(cors)
    if (!hasDashboardCredentials(request, env)) return unauthorizedResponse(cors)
    if (!env.githubToken) return errorResponse(500, 'Proxy is not configured', cors)

    try {
      return jsonResponse(200, await createDashboardSession(env.rateLimitUsername, env.githubToken), cors)
    } catch {
      return errorResponse(500, 'Could not create a dashboard session', cors)
    }
  }

  if (path === '/rate_limit/snapshot') {
    if (request.method !== 'POST') return errorResponse(405, 'Method not allowed', cors)
    if (!env.rateLimitUsername || !env.rateLimitPassword) return dashboardNotConfiguredResponse(cors)
    if (!hasDashboardCredentials(request, env)) return unauthorizedResponse(cors)
    return captureRateLimitSnapshot(env, cors, fetchImpl)
  }

  if (path === '/rate_limit/history') {
    if (request.method !== 'GET') return errorResponse(405, 'Method not allowed', cors)
    if (!env.rateLimitUsername || !env.rateLimitPassword) return dashboardNotConfiguredResponse(cors)
    if (!(await hasDashboardAuthorization(request, env))) return unauthorizedResponse(cors)
    return readRateLimitHistory(env, cors, fetchImpl)
  }

  if (request.method !== 'GET') return errorResponse(405, 'Method not allowed', cors)

  const resolved = resolveUpstream(requestUrl)
  if ('error' in resolved) return errorResponse(resolved.status, resolved.error, cors)

  if (resolved.requiresDashboardAuth) {
    if (!env.rateLimitUsername || !env.rateLimitPassword) return dashboardNotConfiguredResponse(cors)
    if (!(await hasDashboardAuthorization(request, env))) return unauthorizedResponse(cors)
  }

  if (!env.githubToken) return errorResponse(500, 'Proxy is not configured', cors)

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
