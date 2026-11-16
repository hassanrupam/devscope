import { cn } from '@/lib/utils'

export function Shimmer({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('r-shimmer rounded-lg', className)} />
}

const label = { role: 'status', 'aria-busy': true } as const

export function DnaSkeleton() {
  return (
    <div {...label} aria-label="Loading profile" className="space-y-5">
      <div className="flex items-center gap-4">
        <Shimmer className="size-20 rounded-full" />
        <div className="flex-1 space-y-2.5">
          <Shimmer className="h-6 w-1/2" />
          <Shimmer className="h-4 w-1/3" />
          <Shimmer className="h-6 w-2/3" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
        <Shimmer className="h-24" />
        <Shimmer className="h-24" />
      </div>
    </div>
  )
}

export function VelocitySkeleton() {
  return (
    <div {...label} aria-label="Loading velocity" className="grid items-center gap-4 sm:grid-cols-[1fr_1.4fr_1fr]">
      <div className="space-y-3">
        <Shimmer className="h-20" />
        <Shimmer className="h-20" />
      </div>
      <div className="relative mx-auto aspect-[2/1.15] w-full max-w-[320px]">
        <svg viewBox="0 0 200 115" className="size-full">
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-slate-300/50 dark:stroke-slate-700/60" />
        </svg>
        <Shimmer className="absolute inset-x-[22%] bottom-0 h-8" />
      </div>
      <div className="space-y-3">
        <Shimmer className="h-20" />
        <Shimmer className="h-20" />
      </div>
    </div>
  )
}

export function BlockSkeleton({ label: text, className }: { label: string; className?: string }) {
  return (
    <div {...label} aria-label={text} className={cn('space-y-3', className)}>
      <Shimmer className="h-6 w-1/3" />
      <Shimmer className="h-40 w-full" />
      <Shimmer className="h-4 w-2/3" />
    </div>
  )
}
