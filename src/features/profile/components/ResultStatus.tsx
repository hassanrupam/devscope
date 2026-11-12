import { Badge } from '@/components/ui/badge'
import type { CacheMeta } from '@/services/cache/cacheFirst'
import { formatRelativeTime } from '@/lib/utils'

interface ResultStatusProps {
  result: CacheMeta
  testId?: string
}

/** Where the data came from, when it was refreshed, and any stale/cache-problem warnings. */
export function ResultStatus({ result, testId = 'result-status' }: ResultStatusProps) {
  const { source, stale, fetchedAt, cacheStatus } = result
  const label = stale ? 'Cached (may be outdated)' : source === 'cache' ? 'Shared cache' : 'Live from GitHub'
  const tone = stale ? 'warning' : source === 'cache' ? 'success' : 'neutral'

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400" data-testid={testId}>
        <Badge tone={tone}>{label}</Badge>
        <span>
          Last refreshed{' '}
          <time dateTime={fetchedAt.toISOString()} title={fetchedAt.toLocaleString()}>
            {formatRelativeTime(fetchedAt)}
          </time>
        </span>
      </p>

      {stale ? (
        <p role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          GitHub could not be reached, so this saved copy is shown. It may be out of date.
        </p>
      ) : null}

      {cacheStatus !== 'ok' ? (
        <p role="status" className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {cacheStatus === 'unavailable'
            ? 'The shared cache is unavailable right now, so this was loaded directly from GitHub.'
            : 'This could not be saved to the shared cache, so the next visitor may need to reload it.'}
        </p>
      ) : null}
    </div>
  )
}
