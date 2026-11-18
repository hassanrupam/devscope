import { useId, type ReactNode } from 'react'
import { ReportCard } from '@/features/report/components/ReportCard'
import { formatCount } from '@/lib/utils'
import { HEALTH_META, healthOf, percentUsed } from '../insights'
import type { RateLimitResource } from '../rateLimitClient'
import { ResetCountdown } from './ResetCountdown'

/** Primary quota: a health-coloured gauge, the reset countdown and (as children) the usage trend. */
export function QuotaHero({ resource, historyError, children }: { resource: RateLimitResource; historyError: string | null; children: ReactNode }) {
  const uid = useId().replaceAll(':', '')
  const percent = percentUsed(resource)
  const health = HEALTH_META[healthOf(resource)]
  const reset = resource.reset > 0 ? new Date(resource.reset * 1000) : null
  const resetDateTime = reset?.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })

  return (
    <ReportCard label="Primary core quota" className="p-0 sm:p-0" bodyClassName="p-0">
      <div className="relative grid items-center gap-6 p-4 sm:grid-cols-2 sm:p-6 lg:gap-10">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-24 size-72 rounded-full opacity-20 blur-3xl transition-colors duration-700" style={{ background: health.color }} />
        <div className="relative flex flex-col items-center">
          <svg
            role="meter"
            aria-label="Primary core quota used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-valuetext={`${formatCount(resource.used)} of ${formatCount(resource.limit)} used`}
            viewBox="0 0 220 140"
            className="h-44 w-full max-w-[360px] sm:h-48"
          >
            <defs>
              <linearGradient id={`g-${uid}`} x1="0" x2="1">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor={health.color} />
              </linearGradient>
            </defs>
            {[0, 25, 50, 75, 100].map((tick) => {
              const a = Math.PI * (1 - tick / 100)
              const x1 = 110 + Math.cos(a) * 102
              const y1 = 115 - Math.sin(a) * 102
              const x2 = 110 + Math.cos(a) * 108
              const y2 = 115 - Math.sin(a) * 108
              return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--r-muted)" strokeOpacity={0.5} strokeWidth={1.5} />
            })}
            <path d="M 20 115 A 90 90 0 0 1 200 115" pathLength={100} fill="none" stroke="var(--r-track)" strokeWidth="13" strokeLinecap="round" />
            <path
              d="M 20 115 A 90 90 0 0 1 200 115"
              pathLength={100}
              fill="none"
              stroke={`url(#g-${uid})`}
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(percent, percent > 0 ? 1.2 : 0)} 100`}
              style={{ filter: `drop-shadow(0 0 6px ${health.color}99)`, transition: 'stroke-dasharray 1.1s cubic-bezier(.22,1,.36,1)' }}
            />
            <text x="110" y="84" textAnchor="middle" className="fill-slate-500 text-[11px] uppercase tracking-widest dark:fill-slate-400">Used</text>
            <text x="110" y="106" textAnchor="middle" className="fill-slate-950 text-[19px] font-bold dark:fill-white">
              {formatCount(resource.used)} / {formatCount(resource.limit)}
            </text>
          </svg>
          <p className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <span>{formatCount(resource.remaining)} remaining · {percent.toFixed(2)}% used</span>
            <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ background: `${health.color}26`, color: health.color }}>{health.label}</span>
          </p>
        </div>

        <div className="relative flex min-h-36 flex-col items-center justify-center border-t border-slate-200/80 pt-5 text-center dark:border-white/[0.08] sm:min-h-44 sm:border-l sm:border-t-0 sm:py-4 sm:pl-8">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Reset in:</p>
          <div className="relative mt-1 flex min-h-24 w-full items-center justify-center">
            <svg aria-hidden="true" viewBox="0 0 360 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-full w-full max-w-[360px] overflow-visible">
              <defs>
                <linearGradient id="reset-arc-gradient" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.85" />
                  <stop offset="50%" stopColor="#6366f1" stopOpacity="0.62" />
                  <stop offset="100%" stopColor="#fb923c" stopOpacity="0.82" />
                </linearGradient>
              </defs>
              <path className="countdown-orbit countdown-orbit-outer" d="M 52 15 C 30 34 30 66 52 85 M 308 15 C 330 34 330 66 308 85" />
              <path className="countdown-orbit countdown-orbit-inner" d="M 65 23 C 45 38 45 62 65 77 M 295 23 C 315 38 315 62 295 77" />
            </svg>
            {reset ? <ResetCountdown reset={resource.reset} label="Primary Core reset countdown" /> : <p className="text-sm text-slate-500">Not available</p>}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Reset: <span className="font-medium tabular-nums">{resetDateTime ?? '—'}</span>
          </p>
        </div>
      </div>
      {historyError ? (
        <p role="alert" className="mx-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200 sm:mx-6">
          Historical usage could not be loaded: {historyError}
        </p>
      ) : null}
      {children}
    </ReportCard>
  )
}
