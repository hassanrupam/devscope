import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { InsightRelease } from '@/services/github/schema'

const KIND: Record<InsightRelease['kind'], { label: string; chip: string; dot: string }> = {
  pre: { label: 'Pre-release', chip: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300', dot: 'border-amber-400' },
  major: { label: 'Major', chip: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300', dot: 'border-indigo-400' },
  minor: { label: 'Minor', chip: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300', dot: 'border-cyan-400' },
  patch: { label: 'Patch', chip: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'border-emerald-400' },
}

export function cadenceLabel(days: number | null): string {
  if (days === null) return '—'
  if (days <= 1) return 'Daily'
  if (days >= 60) return `Every ${Math.round(days / 30)}mo`
  return `Every ${days}d`
}

/** Vertical release stream across the user's most recently active projects. */
export function ProjectTimeline({ items }: { items: InsightRelease[] }) {
  const [open, setOpen] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <p role="status" className="rounded-xl border border-dashed border-slate-300/80 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700/80">
        No published releases or version tags found in this user&apos;s recently active repositories.
      </p>
    )
  }

  return (
    <ol className="relative min-w-0 space-y-2.5" aria-label="Release timeline">
      <motion.span
        aria-hidden="true"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        style={{ originY: 0 }}
        className="absolute bottom-5 left-[7px] top-5 w-0.5 rounded-full bg-gradient-to-b from-emerald-400 via-indigo-400 to-transparent"
      />
      {items.map((item, i) => {
        const id = `${item.repo}@${item.tag}`
        const expanded = open === id
        const kind = KIND[item.kind]
        return (
          <motion.li
            key={id}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="relative min-w-0 pl-7"
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-0 top-5 size-4 rounded-full border-2 bg-white dark:bg-slate-950',
                i === 0 ? 'border-emerald-400 shadow-[0_0_10px_rgb(52_211_153/0.7)]' : kind.dot,
              )}
            />
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : id)}
              className="block w-full min-w-0 rounded-xl border border-slate-200/80 bg-white/60 p-3.5 text-left transition-colors hover:border-indigo-400/50 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            >
              <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="max-w-full break-all font-mono text-sm font-bold">{item.tag}</span>
                  <span className={cn('rounded-md border px-1.5 py-0.5 text-[0.65rem] font-semibold', kind.chip)}>{kind.label}</span>
                  <span className="min-w-0 truncate font-mono text-[0.7rem] text-slate-500 dark:text-slate-400">{item.repo}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {item.sincePrevDays !== null && item.sincePrevTag ? (
                    <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[0.65rem] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                      +{item.sincePrevDays}d since {item.sincePrevTag.replace(/^v/i, '')}
                    </span>
                  ) : null}
                  <time dateTime={item.publishedAt}>{formatRelativeTime(new Date(item.publishedAt))}</time>
                </span>
              </span>
              <span className={cn('mt-1.5 block break-words text-sm text-slate-600 dark:text-slate-400', !expanded && 'line-clamp-2')}>
                {item.notes || 'No release notes.'}
              </span>
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.span
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="block overflow-hidden"
                  >
                    <span className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <span>{item.source === 'tag' ? 'Version tag (no GitHub release)' : 'GitHub release'}</span>
                      <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">
                        Open on GitHub ↗
                      </a>
                    </span>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          </motion.li>
        )
      })}
    </ol>
  )
}
