export type AppErrorCode =
  | 'invalid_username'
  | 'not_found'
  | 'rate_limited'
  | 'network'
  | 'upstream'

/** Errors that are safe to show to end users. Internal details stay in `cause`. */
export class AppError extends Error {
  readonly code: AppErrorCode
  /** When a rate limit resets (if GitHub told us). */
  readonly resetAt?: Date

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown; resetAt?: Date }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.resetAt = options?.resetAt
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/** Maps any thrown value to a safe AppError. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value
  return new AppError('upstream', 'Something went wrong. Please try again.', { cause: value })
}
