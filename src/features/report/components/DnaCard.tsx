import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { ExternalLinkIcon, InfoIcon } from '@/components/ui/icons'
import { formatCount } from '@/lib/utils'
import type { GitHubProfile, Report } from '@/services/github/schema'
import { useCountUp } from '../hooks'
import { impactScore } from '../metrics'
import { summarizeRepos } from '../../repos/summarize'
import type { Repo } from '@/services/github/schema'

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
    {children}
  </span>
)

function Tile({ label, value, loading }: { label: string; value: number | null; loading?: boolean }) {
  const shown = useCountUp(value ?? 0, { duration: 1.3, enabled: value !== null })
  return (
    <div className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-white/80 to-indigo-50/60 px-3 py-2.5 text-center dark:border-white/[0.06] dark:from-white/[0.04] dark:to-indigo-400/[0.05]">
      <div className="text-lg font-semibold tabular-nums sm:text-xl">
        {value === null ? (loading ? <span className="r-shimmer mx-auto block h-6 w-12 rounded" /> : '—') : formatCount(Math.round(shown))}
      </div>
      <div className="text-[0.65rem] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

/* ------------------------------ Member-since timeline ------------------------------ */

function MemberTimeline({ startYear, endYear, milestones }: { startYear: number; endYear: number; milestones: Map<number, number> }) {
  const span = Math.max(1, endYear - startYear)
  const years = endYear - startYear
  const labelEvery = years > 14 ? 4 : years > 8 ? 2 : 1
  const maxRepos = Math.max(1, ...milestones.values())

  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="mb-3 flex items-baseline justify-between text-xs">
        <span className="font-medium text-slate-600 dark:text-slate-300">Member since {startYear}</span>
        <span className="text-slate-500 dark:text-slate-400">{years === 0 ? 'joined this year' : `${years} year${years === 1 ? '' : 's'}`}</span>
      </div>
      <div className="relative mx-2 h-9" role="img" aria-label={`Member from ${startYear} to ${endYear}`}>
        <div className="absolute inset-x-0 top-3 h-1.5 rounded-full" style={{ background: 'var(--r-track)' }} />
        <motion.div
          className="absolute left-0 top-3 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-400"
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
        {Array.from({ length: years + 1 }, (_, i) => startYear + i).map((year, i) => {
          const left = `${(i / span) * 100}%`
          const repos = milestones.get(year)
          const isLast = year === endYear
          return (
            <div key={year} className="absolute top-0" style={{ left }}>
              {repos ? (
                <motion.span
                  title={`${year}: ${repos} repo${repos === 1 ? '' : 's'} created`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4 + (i / span) * 1.2, type: 'spring', stiffness: 300, damping: 16 }}
                  className="absolute left-0 top-[0.65rem] -translate-x-1/2 rounded-full bg-white ring-2 ring-indigo-500 dark:bg-slate-900"
                  style={{ width: 8 + (repos / maxRepos) * 6, height: 8 + (repos / maxRepos) * 6, marginTop: -((repos / maxRepos) * 3) }}
                />
              ) : (
                <span className="absolute left-0 top-[0.8rem] size-[3px] -translate-x-1/2 rounded-full bg-slate-400/70" />
              )}
              {isLast ? (
                <>
                  <span aria-hidden="true" className="absolute left-0 top-[0.4rem] size-3.5 -translate-x-1/2 rounded-full bg-indigo-400/50" style={{ animation: 'r-pulse-ring 2s ease-out infinite' }} />
                  <span className="absolute left-0 top-[0.45rem] size-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_3px_rgb(129_140_248/0.8)]" />
                </>
              ) : null}
              {i % labelEvery === 0 || isLast ? (
                <span className={`absolute top-6 -translate-x-1/2 text-[0.65rem] tabular-nums text-slate-500 dark:text-slate-400 ${isLast ? 'font-semibold text-slate-700 dark:text-slate-200' : ''}`}>{year}</span>
              ) : null}
            </div>
          )
        })}
      </div>
      {milestones.size > 0 ? <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-500">Dots mark years in which repositories were created.</p> : null}
    </div>
  )
}

/* ---------------------------------- Impact score ---------------------------------- */

function ImpactBlock({ score, tier, parts }: ReturnType<typeof impactScore>) {
  const [open, setOpen] = useState(false)
  const shown = useCountUp(score, { duration: 1.6 })
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600 dark:text-slate-300">Impact score</span>
        <button
          type="button"
          aria-expanded={open}
          aria-label="How the impact score is calculated"
          onClick={() => setOpen((o) => !o)}
          className="r-no-print rounded-full p-0.5 text-slate-400 transition-colors hover:text-indigo-500 dark:hover:text-indigo-300"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span data-testid="impact-score" className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-3xl font-bold tabular-nums text-transparent dark:from-indigo-300 dark:to-violet-300">
          {Math.round(shown)}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">/ 100 · {tier}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--r-track)' }}>
        <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} />
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ul className="mt-3 space-y-1.5 text-[0.7rem]">
              {parts.map((p) => (
                <li key={p.label}>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>{p.label}</span>
                    <span className="text-slate-500 dark:text-slate-400">{p.detail}</span>
                  </div>
                  <div className="mt-0.5 h-1 rounded-full" style={{ background: 'var(--r-track)' }}>
                    <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.round(p.value * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.65rem] text-slate-500">DevExplore&apos;s own log-scaled estimate of public footprint — not an official GitHub ranking.</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------- Card body ------------------------------------ */

interface DnaProps {
  profile: GitHubProfile
  repos: Repo[] | undefined
  report: Report | undefined
  reportLoading: boolean
}

export function DnaContent({ profile, repos, report, reportLoading }: DnaProps) {
  const summary = useMemo(() => (repos ? summarizeRepos(repos) : null), [repos])
  const now = useMemo(() => new Date(), [])
  const startYear = profile.created_at ? new Date(profile.created_at).getUTCFullYear() : now.getUTCFullYear()
  const milestones = useMemo(() => new Map((report?.starsByYear ?? []).map((r) => [r.year, r.repos])), [report])
  const impact = useMemo(
    () => impactScore(profile, { totalStars: summary?.totalStars, yearContributions: report?.totals.contributions, now }),
    [profile, summary, report, now],
  )
  const topLanguage = summary?.languages[0]?.language

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative shrink-0">
          <motion.span aria-hidden="true" className="absolute -inset-1.5 rounded-full bg-gradient-conic opacity-80 blur-[2px]" style={{ background: 'conic-gradient(from 0deg, #6366f1, #8b5cf6, #38bdf8, #6366f1)' }} animate={{ rotate: 360 }} transition={{ duration: 10, ease: 'linear', repeat: Infinity }} />
          <img src={profile.avatar_url} alt={`${profile.login} avatar`} width={88} height={88} className="relative size-[5.5rem] rounded-full border-4 border-white object-cover dark:border-slate-950" />
        </div>
        <div className="min-w-[11rem] flex-1">
          <h2 className="break-words text-2xl font-bold tracking-tight">{profile.name ?? profile.login}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">@{profile.login}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topLanguage ? <Chip>{topLanguage}</Chip> : null}
            {profile.location ? <Chip>{profile.location}</Chip> : null}
            {profile.company ? <Chip>{profile.company}</Chip> : null}
          </div>
        </div>
        <a
          href={profile.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="r-no-print inline-flex h-9 items-center gap-2 rounded-xl border border-slate-300/80 bg-white/50 px-3 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/60 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-indigo-400/40 dark:hover:bg-indigo-400/10"
        >
          View on GitHub <ExternalLinkIcon />
        </a>
      </div>

      {profile.bio ? <p className="text-sm text-slate-600 dark:text-slate-300">{profile.bio}</p> : null}

      <div className="grid gap-3 md:grid-cols-[1.7fr_1fr]">
        <MemberTimeline startYear={startYear} endYear={Math.max(startYear, now.getUTCFullYear())} milestones={milestones} />
        <ImpactBlock {...impact} />
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Followers" value={profile.followers} />
        <Tile label="Public repos" value={profile.public_repos} />
        <Tile label="Stars earned" value={summary?.totalStars ?? null} loading={!repos} />
        <Tile label="Contributions" value={report?.totals.contributions ?? null} loading={reportLoading} />
      </dl>
    </div>
  )
}
