import type { AppError } from '@/lib/errors'

const titles: Record<AppError['code'], string> = {
  invalid_username: 'Invalid username',
  not_found: 'User not found',
  rate_limited: 'GitHub rate limit reached',
  network: 'Connection problem',
  upstream: 'GitHub is unavailable',
  unavailable: 'Feature not enabled',
}

export function ErrorPanel({ error }: { error: AppError }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50/95 to-white/70 p-4 text-red-900 shadow-lg shadow-red-950/[0.04] backdrop-blur-xl sm:p-6 dark:border-red-900/80 dark:from-red-950/60 dark:to-slate-900/70 dark:text-red-200"
    >
      <h2 className="font-semibold">{titles[error.code]}</h2>
      <p className="mt-1 break-words text-sm">{error.message}</p>
      {error.code === 'rate_limited' && error.resetAt ? (
        <p className="mt-1 text-sm">Limit resets around {error.resetAt.toLocaleTimeString()}.</p>
      ) : null}
    </div>
  )
}
