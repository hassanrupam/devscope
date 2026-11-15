import { Card } from '@/components/ui/card'

export function ProfileSkeleton() {
  return (
    <Card className="animate-pulse p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading profile">
      <div className="flex items-center gap-5">
        <div className="size-20 shrink-0 rounded-full bg-slate-200 sm:size-28 dark:bg-slate-800" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-6 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
    </Card>
  )
}
