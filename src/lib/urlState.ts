import { config } from '@/config'
import { parsePrefix, parseUsername } from './username'

export type View = 'explore' | 'compare'

/** Everything that is reflected in the address bar, so views can be bookmarked and shared. */
export interface UrlState {
  view: View
  /** Username or username prefix searched in the Explore view. */
  query: string | null
  /** Usernames in the comparison. */
  users: string[]
}

/** Reads `?u=`, `?view=compare` and `?users=a,b,c`, ignoring anything invalid. */
export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search)

  let query: string | null = null
  const rawQuery = params.get('u')
  if (rawQuery) {
    try {
      query = parsePrefix(rawQuery)
    } catch {
      query = null
    }
  }

  const users: string[] = []
  for (const raw of (params.get('users') ?? '').split(',')) {
    try {
      const username = parseUsername(raw)
      if (!users.includes(username)) users.push(username)
    } catch {
      // skip invalid entries
    }
  }

  return {
    view: params.get('view') === 'compare' ? 'compare' : 'explore',
    query,
    users: users.slice(0, config.maxCompareUsers),
  }
}

/** Builds the query string for a state (no leading "?"; empty string when nothing is set). */
export function serializeUrlState(state: UrlState): string {
  const params = new URLSearchParams()
  if (state.query) params.set('u', state.query)
  if (state.view === 'compare') params.set('view', 'compare')
  if (state.users.length > 0) params.set('users', state.users.join(','))
  return params.toString().replace(/%2C/g, ',')
}
