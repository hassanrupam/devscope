import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { ExternalLinkIcon } from '@/components/ui/icons'
import { formatCount, toSafeWebUrl } from '@/lib/utils'
import type { GitHubProfile } from '@/services/github/schema'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-white/90 to-indigo-50/60 px-3 py-3 text-center shadow-inner shadow-slate-900/[0.02] sm:px-4 dark:border-slate-700/70 dark:from-slate-800/90 dark:to-indigo-950/30">
      <dd className="text-lg font-semibold tabular-nums sm:text-xl">{formatCount(value)}</dd>
      <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-slate-500 sm:text-xs dark:text-slate-400">{label}</dt>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
      <span className="w-20 shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

export function ProfileCard({ profile, actions }: { profile: GitHubProfile; actions?: ReactNode }) {
  const website = toSafeWebUrl(profile.blog)
  const memberSince = profile.created_at ? new Date(profile.created_at).getFullYear() : null

  return (
    <Card className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left lg:flex-1">
          <img
            src={profile.avatar_url}
            alt={`${profile.login} avatar`}
            width={112}
            height={112}
            className="size-28 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700"
          />
          <div className="min-w-0 lg:flex-1">
            <h2 className="text-2xl font-bold break-words">{profile.name ?? profile.login}</h2>
            <p className="text-slate-500 dark:text-slate-400">@{profile.login}</p>
            {profile.bio ? <p className="mt-3 break-words text-slate-700 dark:text-slate-300">{profile.bio}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 lg:shrink-0 lg:flex-nowrap lg:justify-end">
          <a
            href={profile.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300/80 bg-white/50 px-4 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/60 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30"
          >
            View on GitHub <ExternalLinkIcon />
          </a>
          {actions}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
        <Stat label="Repos" value={profile.public_repos} />
        <Stat label="Followers" value={profile.followers} />
        <Stat label="Following" value={profile.following} />
      </dl>

      <ul className="mt-5 space-y-2 sm:mt-6">
        {profile.company ? <Detail label="Company">{profile.company}</Detail> : null}
        {profile.location ? <Detail label="Location">{profile.location}</Detail> : null}
        {website ? (
          <Detail label="Website">
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
            >
              {profile.blog}
            </a>
          </Detail>
        ) : null}
        {memberSince ? <Detail label="Joined">{memberSince}</Detail> : null}
      </ul>
    </Card>
  )
}
