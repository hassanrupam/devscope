import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { LockIcon, RefreshIcon } from '@/components/ui/icons'
import { toAppError } from '@/lib/errors'
import type { ReportResult } from '../reportService'

interface ReportGateProps {
  query: UseQueryResult<ReportResult>
  skeleton: ReactNode
  children: (result: ReportResult) => ReactNode
}

/** Shows a skeleton while the report loads, a friendly message if it cannot be built, else the section. */
export function ReportGate({ query, skeleton, children }: ReportGateProps) {
  if (query.isPending) return <>{skeleton}</>
  if (query.error || !query.data) {
    const error = toAppError(query.error)
    const notEnabled = error.code === 'unavailable'
    return (
      <div role="status" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300/80 px-4 py-8 text-center dark:border-slate-700/80">
        <span className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <LockIcon className="size-5" />
        </span>
        <p className="max-w-xs text-sm text-slate-600 dark:text-slate-400">{error.message}</p>
        {notEnabled ? null : (
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/80 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <RefreshIcon className="size-3.5" />
            Try again
          </button>
        )}
      </div>
    )
  }
  return <>{children(query.data)}</>
}
