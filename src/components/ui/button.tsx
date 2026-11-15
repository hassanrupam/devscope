import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Button({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-indigo-950/10 transition-all duration-200 sm:px-5',
        'hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
        className,
      )}
      {...props}
    />
  )
}
