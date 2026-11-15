import { cn } from '@/lib/utils'
import type { LanguageShare } from '../summarize'

const GRADIENTS = [
  'from-indigo-400 to-violet-600',
  'from-emerald-400 to-teal-600',
  'from-amber-300 to-orange-500',
  'from-rose-400 to-pink-600',
  'from-sky-400 to-cyan-600',
  'from-fuchsia-400 to-purple-600',
]
const OTHER_GRADIENT = 'from-slate-400 to-slate-500'

function formatPercent(percent: number): string {
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`
}

interface LanguageBarProps {
  languages: LanguageShare[]
  /** How many languages get their own segment; the rest are grouped as "Other". */
  max?: number
  className?: string
}

/** Stacked bar plus a text legend, so the information never relies on colour alone. */
export function LanguageBar({ languages, max = 5, className }: LanguageBarProps) {
  if (languages.length === 0) {
    return <p className={cn('text-sm text-slate-500 dark:text-slate-400', className)}>No language data.</p>
  }

  const otherPercent = languages.slice(max).reduce((sum, l) => sum + l.percent, 0)
  const segments = [
    ...languages.slice(0, max).map((l, i) => ({
      label: l.language,
      percent: l.percent,
      gradient: GRADIENTS[i % GRADIENTS.length] ?? OTHER_GRADIENT,
    })),
    ...(otherPercent > 0 ? [{ label: 'Other', percent: otherPercent, gradient: OTHER_GRADIENT }] : []),
  ]

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Languages: ${segments.map((s) => `${s.label} ${formatPercent(s.percent)}`).join(', ')}`}
        className="flex h-3 overflow-hidden rounded-full bg-slate-200 shadow-inner ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10"
      >
        {segments.map((s) => (
          <div
            key={s.label}
            className={cn('bg-gradient-to-r border-r border-white/40 last:border-r-0 dark:border-slate-950/25', s.gradient)}
            style={{ width: `${s.percent}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full bg-gradient-to-br', s.gradient)} aria-hidden="true" />
            {s.label} <span className="text-slate-500 dark:text-slate-400">{formatPercent(s.percent)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
