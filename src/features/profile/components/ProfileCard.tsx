import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { BuildingIcon, CalendarIcon, ExternalLinkIcon, GlobeIcon, MapPinIcon } from '@/components/ui/icons'
import { useCountUp } from '@/features/report/hooks'
import { cn, formatCount, formatRelativeTime, toSafeWebUrl } from '@/lib/utils'
import type { GitHubProfile } from '@/services/github/schema'

const YEAR_MS = 365.25 * 86_400_000

function Stat({ label, value, accent }: { label: string; value: number | null; accent: string }) {
  const shown = useCountUp(value ?? 0, { duration: 1.1, enabled: value !== null })
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-3 text-center dark:border-white/[0.06] dark:bg-white/[0.03]">
      <span aria-hidden="true" className="absolute inset-x-3 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <dd className="text-xl font-bold tabular-nums sm:text-2xl">{value === null ? '—' : formatCount(Math.round(shown))}</dd>
      <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</dt>
    </div>
  )
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{icon}</span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

function Highlight({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white/50 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <p className="truncate text-[0.62rem] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</p>
      {hint ? <p className="truncate text-[0.68rem] text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  )
}

export function ProfileCard({ profile, actions }: { profile: GitHubProfile; actions?: ReactNode }) {
  const website = toSafeWebUrl(profile.blog)
  const created = profile.created_at ? new Date(profile.created_at) : null
  const memberSince = created ? created.getFullYear() : null
  // eslint-disable-next-line react-hooks/purity -- an age is relative to "now" by definition
  const years = created ? Math.max(0, (Date.now() - created.getTime()) / YEAR_MS) : null
  const ratio = profile.following > 0 ? profile.followers / profile.following : null
  const updated = profile.updated_at ? new Date(profile.updated_at) : null

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`Profile of ${profile.login}`}
      className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-900/[0.05] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gradient-to-b dark:from-slate-900/80 dark:to-slate-950/80 dark:shadow-black/40"
    >
      {/* banner */}
      <div aria-hidden="true" className="relative h-24 overflow-hidden bg-gradient-to-r from-indigo-500/30 via-violet-500/25 to-cyan-400/25 sm:h-28">
        <div className="r-aurora absolute -left-10 -top-16 size-48 rounded-full bg-indigo-500/40 blur-3xl" />
        <div className="r-aurora absolute -right-6 -top-10 size-40 rounded-full bg-cyan-400/30 blur-3xl [animation-delay:-7s]" />
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.5) 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-12 flex flex-wrap items-end justify-between gap-3 sm:-mt-14">
          <div className="rounded-full bg-gradient-to-br from-indigo-400 via-violet-400 to-cyan-300 p-[3px] shadow-lg shadow-indigo-500/30">
            <img
              src={profile.avatar_url}
              alt={`${profile.login} avatar`}
              width={112}
              height={112}
              className="size-24 rounded-full border-2 border-white bg-white object-cover dark:border-slate-950 dark:bg-slate-950 sm:size-28"
            />
          </div>
          <a
            href={profile.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300/80 bg-white/60 px-4 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-indigo-400/50 dark:hover:bg-white/[0.08]"
          >
            View on GitHub <ExternalLinkIcon />
          </a>
        </div>

        <div className="mt-3 min-w-0">
          <h2 className="break-words text-2xl font-bold tracking-tight">{profile.name ?? profile.login}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-500 dark:text-slate-400">
            <span>@{profile.login}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 dark:bg-white/10 dark:text-slate-300">{profile.type}</span>
            {profile.hireable ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" /> Open to work
              </span>
            ) : null}
          </p>
          {profile.bio ? <p className="mt-3 break-words text-sm leading-relaxed text-slate-700 dark:text-slate-300">{profile.bio}</p> : null}
        </div>

        {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}

        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Repos" value={profile.public_repos} accent="#22d3ee" />
          <Stat label="Followers" value={profile.followers} accent="#a78bfa" />
          <Stat label="Following" value={profile.following} accent="#34d399" />
          <Stat label="Gists" value={profile.public_gists} accent="#fbbf24" />
        </dl>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Highlight label="Account age" value={years === null ? '—' : `${years.toFixed(1)} yrs`} hint={memberSince ? `since ${memberSince}` : undefined} />
          <Highlight label="Follower ratio" value={ratio === null ? '—' : `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)} : 1`} hint="followers per following" />
          <Highlight label="Followers / year" value={years && years > 0.1 ? formatCount(Math.round(profile.followers / years)) : '—'} hint="average growth" />
          <Highlight label="Profile updated" value={updated ? formatRelativeTime(updated) : '—'} />
        </div>

        <ul className={cn('mt-4 grid gap-2.5 sm:grid-cols-2', !(profile.company || profile.location || website || profile.twitter_username || memberSince) && 'hidden')}>
          {profile.company ? <Fact icon={<BuildingIcon className="size-4" />} label="Company">{profile.company}</Fact> : null}
          {profile.location ? <Fact icon={<MapPinIcon className="size-4" />} label="Location">{profile.location}</Fact> : null}
          {website ? (
            <Fact icon={<GlobeIcon className="size-4" />} label="Website">
              <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
                {profile.blog}
              </a>
            </Fact>
          ) : null}
          {profile.twitter_username ? (
            <Fact icon={<span className="text-xs font-bold">𝕏</span>} label="X / Twitter">
              <a href={`https://x.com/${encodeURIComponent(profile.twitter_username)}`} target="_blank" rel="noopener noreferrer nofollow" className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
                @{profile.twitter_username}
              </a>
            </Fact>
          ) : null}
          {memberSince ? <Fact icon={<CalendarIcon className="size-4" />} label="Joined">{memberSince}</Fact> : null}
        </ul>
      </div>
    </motion.section>
  )
}
