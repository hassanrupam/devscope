import { cn } from '@/lib/utils'
import type { LanguageShare } from '../summarize'

const COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500']
const OTHER_COLOR = 'bg-slate-400'

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
    ...languages.slice(0, max).map((l, i) => ({ label: l.language, percent: l.percent, color: COLORS[i % COLORS.length] ?? OTHER_COLOR })),
    ...(otherPercent > 0 ? [{ label: 'Other', percent: otherPercent, color: OTHER_COLOR }] : []),
  ]

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Languages: ${segments.map((s) => `${s.label} ${formatPercent(s.percent)}`).join(', ')}`}
        className="flex h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        {segments.map((s) => (
          <div key={s.label} className={s.color} style={{ width: `${s.percent}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', s.color)} aria-hidden="true" />
            {s.label} <span className="text-slate-500 dark:text-slate-400">{formatPercent(s.percent)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
