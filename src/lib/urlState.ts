import { config } from '@/config'
import { parsePrefix, parseUsername } from './username'

export type View = 'explore' | 'compare' | 'report'

/** Everything that is reflected in the address bar, so views can be bookmarked and shared. */
export interface UrlState {
  view: View
  /** Username or username prefix searched in the Explore view. */
  query: string | null
  /** Usernames in the comparison. */
  users: string[]
  /** User whose full report is open (only meaningful when `view` is 'report'). */
  report: string | null
}

/** Reads `?u=`, `?view=compare|report`, `?users=a,b,c` and `?report=name`, ignoring anything invalid. */
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

  let report: string | null = null
  const rawReport = params.get('report')
  if (rawReport) {
    try {
      report = parseUsername(rawReport)
    } catch {
      report = null
    }
  }

  const requested = params.get('view')
  // A report view without a valid user has nothing to show, so it falls back to Explore.
  const view: View = requested === 'compare' ? 'compare' : requested === 'report' && report ? 'report' : 'explore'

  return {
    view,
    query,
    users: users.slice(0, config.maxCompareUsers),
    report,
  }
}

/** Builds the query string for a state (no leading "?"; empty string when nothing is set). */
export function serializeUrlState(state: UrlState): string {
  const params = new URLSearchParams()
  if (state.query) params.set('u', state.query)
  if (state.view === 'compare') params.set('view', 'compare')
  if (state.view === 'report' && state.report) {
    params.set('view', 'report')
    params.set('report', state.report)
  }
  if (state.users.length > 0) params.set('users', state.users.join(','))
  return params.toString().replace(/%2C/g, ',')
}
