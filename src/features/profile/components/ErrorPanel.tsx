import type { AppError } from '@/lib/errors'

const titles: Record<AppError['code'], string> = {
  invalid_username: 'Invalid username',
  not_found: 'User not found',
  rate_limited: 'GitHub rate limit reached',
  network: 'Connection problem',
  upstream: 'GitHub is unavailable',
}

export function ErrorPanel({ error }: { error: AppError }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 sm:p-6 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
    >
      <h2 className="font-semibold">{titles[error.code]}</h2>
      <p className="mt-1 break-words text-sm">{error.message}</p>
      {error.code === 'rate_limited' && error.resetAt ? (
        <p className="mt-1 text-sm">Limit resets around {error.resetAt.toLocaleTimeString()}.</p>
      ) : null}
    </div>
  )
}
