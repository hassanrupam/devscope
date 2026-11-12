import { Card } from '@/components/ui/card'
import { formatCount, toSafeWebUrl } from '@/lib/utils'
import type { GitHubProfile } from '@/services/github/schema'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 text-center dark:bg-slate-800/60">
      <dd className="text-xl font-semibold tabular-nums">{formatCount(value)}</dd>
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
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

export function ProfileCard({ profile }: { profile: GitHubProfile }) {
  const website = toSafeWebUrl(profile.blog)
  const memberSince = profile.created_at ? new Date(profile.created_at).getFullYear() : null

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
        <img
          src={profile.avatar_url}
          alt={`${profile.login} avatar`}
          width={112}
          height={112}
          className="size-28 rounded-full border border-slate-200 object-cover dark:border-slate-700"
        />
        <div className="min-w-0">
          <h2 className="text-2xl font-bold break-words">{profile.name ?? profile.login}</h2>
          <p className="text-slate-500 dark:text-slate-400">@{profile.login}</p>
          {profile.bio ? <p className="mt-3 break-words text-slate-700 dark:text-slate-300">{profile.bio}</p> : null}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Repos" value={profile.public_repos} />
        <Stat label="Followers" value={profile.followers} />
        <Stat label="Following" value={profile.following} />
      </dl>

      <ul className="mt-6 space-y-2">
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

      <a
        href={profile.html_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        View on GitHub ↗
      </a>
    </Card>
  )
}
