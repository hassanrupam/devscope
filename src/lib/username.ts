import { AppError } from './errors'

/**
 * GitHub login rules: 1-39 chars, alphanumeric or single hyphens,
 * cannot start or end with a hyphen.
 */
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/

/** A prefix is a username-in-progress: same alphabet, but it may end with a hyphen. */
const PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}$/

function normalize(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase()
}

/** Trims, strips a leading "@", lower-cases and validates. Throws AppError('invalid_username'). */
export function parseUsername(raw: string): string {
  const normalized = normalize(raw)
  if (!normalized) {
    throw new AppError('invalid_username', 'Enter a GitHub username to search.')
  }
  if (!USERNAME_PATTERN.test(normalized) || normalized.includes('--')) {
    throw new AppError(
      'invalid_username',
      'That is not a valid GitHub username. Use letters, numbers and single hyphens (max 39 characters).',
    )
  }
  return normalized
}

/** Like parseUsername, but accepts a partial username (e.g. "torv" or "my-"). */
export function parsePrefix(raw: string): string {
  const normalized = normalize(raw)
  if (!normalized) {
    throw new AppError('invalid_username', 'Enter a GitHub username to search.')
  }
  if (!PREFIX_PATTERN.test(normalized) || normalized.includes('--')) {
    throw new AppError(
      'invalid_username',
      'That is not a valid GitHub username. Use letters, numbers and single hyphens (max 39 characters).',
    )
  }
  return normalized
}

/** True when the text is a complete, valid username (so an exact profile lookup makes sense). */
export function isValidUsername(raw: string): boolean {
  try {
    parseUsername(raw)
    return true
  } catch {
    return false
  }
}
