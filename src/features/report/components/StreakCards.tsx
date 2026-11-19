import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { FlameIcon } from '@/components/ui/icons'
import { useCountUp } from '../hooks'
import { streaks, type Day } from '../metrics'
import { ReportCard } from './ReportCard'

const fmt = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function Flame({ hot }: { hot: boolean }) {
  return (
    <div className="relative grid size-11 shrink-0 sm:size-16 place-items-center">
      {hot ? <span aria-hidden="true" className="absolute inset-2 rounded-full bg-orange-500/40" style={{ animation: 'r-pulse-ring 2.2s ease-out infinite' }} /> : null}
      <motion.span
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.3 }}
        className={hot ? 'text-orange-500 drop-shadow-[0_0_14px_rgb(249_115_22/0.7)]' : 'text-slate-400 dark:text-slate-600'}
      >
        <FlameIcon className="size-8 sm:size-12" />
      </motion.span>
    </div>
  )
}

function StreakCard({ title, subtitle, value, detail, index, testId }: { title: string; subtitle: string; value: number; detail: string; index: number; testId: string }) {
  const shown = useCountUp(value, { duration: 1.2 })
  return (
    <ReportCard title={title} subtitle={subtitle} index={index} testId={testId} bodyClassName="flex items-center gap-2.5 sm:gap-4">
      <Flame hot={value > 0} />
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tabular-nums sm:text-4xl tracking-tight">{Math.round(shown)}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">{value === 1 ? 'day' : 'days'}</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      </div>
    </ReportCard>
  )
}

export function StreakCards({ days, index = 5 }: { days: Day[]; index?: number }) {
  const { longest, current } = useMemo(() => streaks(days), [days])
  return (
    <div className="grid grid-cols-2 gap-4">
      <StreakCard
        title="Longest Streak"
        subtitle="In the last 12 months"
        value={longest?.length ?? 0}
        detail={longest ? `${fmt(longest.start)} – ${fmt(longest.end)}` : 'No contributions yet'}
        index={index}
        testId="longest-streak"
      />
      <StreakCard
        title="Current Streak"
        subtitle="Days in a row, up to today"
        value={current}
        detail={current > 0 ? 'Still going — keep it alive!' : 'Not active right now'}
        index={index + 1}
        testId="current-streak"
      />
    </div>
  )
}
