import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/70 bg-white/75 shadow-lg shadow-slate-900/[0.04] ring-1 ring-slate-900/[0.03] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70 dark:shadow-black/25 dark:ring-white/[0.04]',
        className,
      )}
      {...props}
    />
  )
}
