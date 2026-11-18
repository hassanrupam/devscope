import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function ResetCountdown({ reset, label, compact = false }: { reset: number; label: string; compact?: boolean }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (reset <= 0) {
    return (
      <span role="timer" aria-label={label} className="font-mono text-xs text-slate-400">
        —
      </span>
    )
  }

  const totalSeconds = Math.max(0, Math.floor((reset * 1000 - now) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const formatted = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')

  return (
    <span
      role="timer"
      aria-label={label}
      aria-valuetext={`${hours} hours, ${minutes} minutes, ${seconds} seconds`}
      className={cn(
        'font-mono font-semibold tabular-nums',
        compact ? 'text-[11px] tracking-tight text-slate-600 dark:text-slate-300' : 'bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 bg-clip-text text-4xl tracking-tight text-transparent dark:from-cyan-300 dark:via-indigo-300 dark:to-violet-300 sm:text-5xl',
      )}
    >
      {formatted}
    </span>
  )
}
