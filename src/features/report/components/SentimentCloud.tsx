import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Report } from '@/services/github/schema'
import { useInViewOnce } from '../hooks'
import { sentimentLabel } from '../metrics'

const NEUTRAL = ['#818cf8', '#38bdf8', '#a78bfa', '#67e8f9', '#c4b5fd']

/** Biggest words in the middle, smaller ones towards the edges — a cheap, stable "cloud" order. */
function cloudOrder<T>(sorted: T[]): T[] {
  const out: T[] = []
  sorted.forEach((item, i) => (i % 2 === 0 ? out.push(item) : out.unshift(item)))
  return out
}

const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export function SentimentCloud({ sentiment }: { sentiment: Report['sentiment'] }) {
  const [ref, seen] = useInViewOnce<HTMLDivElement>()
  const { words, score, sampleSize } = sentiment

  const placed = useMemo(() => {
    const counts = words.map((w) => w.count)
    const max = Math.max(1, ...counts)
    const min = Math.min(max, ...counts)
    return cloudOrder(words).map((w, i) => {
      const t = max === min ? 0.5 : (w.count - min) / (max - min)
      return {
        ...w,
        size: 12 + t * 22,
        weight: t > 0.6 ? 700 : t > 0.25 ? 600 : 500,
        color: w.tone > 0 ? 'var(--r-green)' : w.tone < 0 ? 'var(--r-red)' : (NEUTRAL[hash(w.text) % NEUTRAL.length] as string),
        opacity: 0.55 + t * 0.45,
        delay: 0.1 + i * 0.03,
        float: (hash(w.text) % 25) / 10,
      }
    })
  }, [words])

  // Marker position: Happy (left) ... Neutral ... Critical (right), like the mockup's gradient bar.
  const position = ((1 - score) / 2) * 100
  const label = sentimentLabel(score)

  if (sampleSize === 0 || words.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No recent public comments to analyse.</p>
  }

  return (
    <div ref={ref} className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[0.7rem] font-medium">
          <span className="text-emerald-600 dark:text-emerald-400">Happy</span>
          <span className="text-slate-500 dark:text-slate-400">Neutral</span>
          <span className="text-rose-600 dark:text-rose-400">Critical</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500" role="img" aria-label={`Tone: ${label}`}>
          <motion.div
            data-testid="sentiment-marker"
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-slate-900 shadow-lg dark:border-slate-100 dark:bg-slate-100"
            initial={{ left: '50%' }}
            animate={{ left: seen ? `${position}%` : '50%' }}
            transition={{ type: 'spring', stiffness: 60, damping: 12, delay: 0.3 }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{label}</span> · based on {sampleSize} recent comment{sampleSize === 1 ? '' : 's'} &amp; titles
        </p>
      </div>

      <ul className="flex min-h-36 flex-wrap items-center justify-center gap-x-3.5 gap-y-1 rounded-xl border border-slate-200/70 bg-slate-50/50 px-3 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]" aria-label="Most used words">
        {placed.map((w) => (
          <motion.li
            key={w.text}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: seen ? w.opacity : 0, scale: seen ? 1 : 0.4 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14, delay: w.delay }}
            title={`${w.text} · ${w.count}×`}
            className={cn('leading-none')}
            style={{ fontSize: w.size, fontWeight: w.weight, color: w.color }}
          >
            <span className="inline-block" style={{ animation: `r-float ${3 + w.float}s ease-in-out ${w.float}s infinite` }}>{w.text}</span>
          </motion.li>
        ))}
      </ul>
      <p className="text-[0.65rem] text-slate-500">Rough, word-list based estimate from public issue comments, issue and pull request titles. Quoted text and code are ignored.</p>
    </div>
  )
}
