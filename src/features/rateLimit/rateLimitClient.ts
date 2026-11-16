import { z } from 'zod'
import { config, isGitHubProxyEnabled } from '@/config'

const resourceSchema = z.object({
  limit: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  reset: z.number().int().nonnegative(),
})

const rateLimitSchema = z.object({
  resources: z.record(z.string(), resourceSchema),
  rate: resourceSchema,
})
const rateLimitSnapshotSchema = z.object({
  captured_at: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  payload: rateLimitSchema,
})
const rateLimitSessionSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
})

export type RateLimitResource = z.infer<typeof resourceSchema>
export type RateLimitData = z.infer<typeof rateLimitSchema>
export type RateLimitSnapshot = z.infer<typeof rateLimitSnapshotSchema>
export type RateLimitSession = z.infer<typeof rateLimitSessionSchema>

function encodeCredentials(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

export async function createRateLimitSession(username: string, password: string): Promise<RateLimitSession> {
  if (!isGitHubProxyEnabled) {
    throw new Error('The private dashboard is unavailable until the GitHub proxy is enabled.')
  }

  let response: Response
  try {
    response = await fetch(`${config.githubApiBase}/rate_limit/session`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: encodeCredentials(username, password),
      },
      cache: 'no-store',
    })
  } catch (error) {
    throw new Error('Could not connect to the private rate-limit service.', { cause: error })
  }

  const dashboardError = response.headers.get('x-devscope-rate-limit-error')
  if (dashboardError === 'unauthorized') throw new Error('Dashboard username or password is incorrect.')
  if (dashboardError === 'not_configured') throw new Error('Dashboard authentication is not configured on the server.')
  if (response.status === 500) throw new Error('The server-side GitHub token or dashboard session service is not configured.')
  if (!response.ok) throw new Error(`Could not start a dashboard session (HTTP ${response.status}).`)

  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    throw new Error('The rate-limit service returned an unreadable session.', { cause: error })
  }

  const parsed = rateLimitSessionSchema.safeParse(body)
  if (!parsed.success) throw new Error('The rate-limit service returned an invalid session.')
  return parsed.data
}

export async function fetchRateLimits(sessionToken: string): Promise<RateLimitData> {
  if (!isGitHubProxyEnabled) {
    throw new Error('The private dashboard is unavailable until the GitHub proxy is enabled.')
  }

  let response: Response
  try {
    response = await fetch(`${config.githubApiBase}/rate_limit`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${sessionToken}`,
      },
      cache: 'no-store',
    })
  } catch (error) {
    throw new Error('Could not connect to the private rate-limit service.', { cause: error })
  }

  const dashboardError = response.headers.get('x-devscope-rate-limit-error')
  if (dashboardError === 'unauthorized') throw new Error('Your dashboard session has expired.')
  if (dashboardError === 'not_configured') throw new Error('Dashboard authentication is not configured on the server.')
  if (response.status === 401) throw new Error('The server-side GitHub token was rejected; check GITHUB_API_TOKEN.')
  if (!response.ok) throw new Error(`Could not load GitHub rate limits (HTTP ${response.status}).`)

  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    throw new Error('The rate-limit service returned an unreadable response.', { cause: error })
  }

  const parsed = rateLimitSchema.safeParse(body)
  if (!parsed.success) throw new Error('GitHub returned unexpected rate-limit data.')
  return parsed.data
}

export async function fetchRateLimitHistory(sessionToken: string): Promise<RateLimitSnapshot[]> {
  if (!isGitHubProxyEnabled) {
    throw new Error('Historical rate-limit data is unavailable until the GitHub proxy is enabled.')
  }

  let response: Response
  try {
    response = await fetch(`${config.githubApiBase}/rate_limit/history`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${sessionToken}` },
      cache: 'no-store',
    })
  } catch (error) {
    throw new Error('Could not connect to the private rate-limit history service.', { cause: error })
  }

  const dashboardError = response.headers.get('x-devscope-rate-limit-error')
  if (dashboardError === 'unauthorized') throw new Error('Your dashboard session has expired.')
  if (dashboardError === 'not_configured') throw new Error('Dashboard authentication is not configured on the server.')
  if (!response.ok) throw new Error(`Could not load rate-limit history (HTTP ${response.status}).`)

  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    throw new Error('The rate-limit history service returned an unreadable response.', { cause: error })
  }

  const parsed = z.array(rateLimitSnapshotSchema).safeParse(body)
  if (!parsed.success) throw new Error('The rate-limit history service returned unexpected data.')
  return parsed.data
}
