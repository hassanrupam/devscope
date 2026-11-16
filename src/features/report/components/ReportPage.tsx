import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftIcon, DownloadIcon, RefreshIcon } from '@/components/ui/icons'
import { config } from '@/config'
import { toAppError } from '@/lib/errors'
import { formatRelativeTime, cn } from '@/lib/utils'
import { ErrorPanel } from '@/features/profile/components/ErrorPanel'
import { useProfile } from '@/features/profile/useProfile'
import { useRepos } from '@/features/repos/useRepos'
import { calendarDays, languageTree } from '../metrics'
import { useRefreshReport, useReport } from '../useReport'
import { CollaborationNetwork } from './CollaborationNetwork'
import { ContributionHeatmap } from './ContributionHeatmap'
import { DnaContent } from './DnaCard'
import { LanguageTree } from './LanguageTree'
import { CardFooter, ReportCard } from './ReportCard'
import { ReportGate } from './ReportGate'
import { ReportProgress } from './ReportProgress'
import { SentimentCloud } from './SentimentCloud'
import { BlockSkeleton, DnaSkeleton, Shimmer, VelocitySkeleton } from './Skeletons'
import { StreakCards } from './StreakCards'
import { VelocityContent } from './VelocityCard'

const DAY_MS = 86_400_000

/** 52 weeks of empty days: lets the heatmap draw its "floor" while the real data is still loading. */
function placeholderDays() {
  const end = Date.now()
  return Array.from({ length: 364 }, (_, i) => ({ date: new Date(end - (363 - i) * DAY_MS).toISOString().slice(0, 10), count: 0 }))
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <motion.h2 initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="flex items-center gap-2.5 text-lg font-bold tracking-tight sm:text-xl">
      <span aria-hidden="true" className="h-5 w-1 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
      {children}
    </motion.h2>
  )
}

function ToolbarButton({ onClick, disabled, children, primary }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60',
        primary
          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 hover:shadow-lg hover:shadow-indigo-500/35'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
      )}
    >
      {children}
    </button>
  )
}

interface ReportPageProps {
  username: string
  onBack: () => void
}

export function ReportPage({ username, onBack }: ReportPageProps) {
  const profile = useProfile(username)
  const repos = useRepos(username)
  const report = useReport(username)
  const refresh = useRefreshReport(username)
  const [note, setNote] = useState<string | null>(null)

  const loginForTitle = profile.data?.profile.login ?? username
  useEffect(() => {
    const previous = document.title
    document.title = `${loginForTitle} · Developer report · DevExplore`
    return () => {
      document.title = previous
    }
  }, [loginForTitle])

  useEffect(() => {
    if (!note) return
    const id = window.setTimeout(() => setNote(null), 4500)
    return () => window.clearTimeout(id)
  }, [note])

  async function handleRefresh() {
    try {
      const result = await refresh.mutateAsync()
      setNote(result.source === 'github' ? 'Report refreshed from GitHub.' : `Already up to date — updated ${formatRelativeTime(result.fetchedAt)}.`)
    } catch (error) {
      setNote(toAppError(error).message)
    }
  }

  const days = useMemo(() => (report.data ? calendarDays(report.data.report.calendar) : []), [report.data])
  const floor = useMemo(placeholderDays, [])
  const tree = useMemo(() => (repos.data ? languageTree(repos.data.repos) : []), [repos.data])

  const profileError = profile.error ? toAppError(profile.error) : null
  const user = profile.data?.profile
  const reportMeta = report.data
  const reportFooter = <CardFooter meta={reportMeta} ttlMs={config.reportTtlMs} />

  if (profileError) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <ErrorPanel error={profileError} />
        <ToolbarButton onClick={onBack}><ArrowLeftIcon /> Back</ToolbarButton>
      </div>
    )
  }

  if (user && user.type !== 'User') {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 text-center">
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Developer reports are available for personal accounts. <strong>@{user.login}</strong> is an {user.type.toLowerCase()}.
        </p>
        <ToolbarButton onClick={onBack}><ArrowLeftIcon /> Back to profile</ToolbarButton>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="space-y-6" data-testid="report-page">
      {/* toolbar */}
      <div className="r-no-print relative flex flex-col items-center gap-3 sm:min-h-12">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-slate-300/80 bg-white/60 px-3 text-sm font-medium shadow-sm backdrop-blur transition-all hover:-translate-x-0.5 hover:bg-white sm:absolute sm:left-0 sm:top-1.5 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10"
        >
          <ArrowLeftIcon /> Back to profile
        </button>
        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 p-1 shadow-lg shadow-slate-900/[0.05] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-black/30">
          <ToolbarButton primary onClick={() => window.print()}>
            <DownloadIcon /> Export Report
          </ToolbarButton>
          <ToolbarButton onClick={() => void handleRefresh()} disabled={refresh.isPending || report.isPending}>
            <RefreshIcon className={cn('size-4', refresh.isPending && 'animate-spin')} /> Refresh Data
          </ToolbarButton>
        </div>
        <ReportProgress active={report.isFetching || refresh.isPending} />
        <AnimatePresence>
          {note ? (
            <motion.p role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs text-slate-600 dark:text-slate-400">
              {note}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="grid items-start gap-x-6 gap-y-6 lg:grid-cols-2">
        {/* ------------------------------ left column ------------------------------ */}
        <div className="flex flex-col gap-4">
          <SectionHeading>Developer DNA</SectionHeading>

          <ReportCard title="Profile" subtitle="Identity, tenure and footprint" index={0} testId="dna-card" footer={<CardFooter meta={profile.data} ttlMs={config.cacheTtlMs} />}>
            {user ? <DnaContent profile={user} repos={repos.data?.repos} report={report.data?.report} reportLoading={report.isPending} /> : <DnaSkeleton />}
          </ReportCard>

          <ReportCard title="Contributions Heatmap" subtitle="Annual activity — hover a column for the day" index={1} testId="heatmap-card" footer={reportFooter}>
            <ReportGate query={report} skeleton={<ContributionHeatmap days={floor} loading />}>
              {() => <ContributionHeatmap days={days} />}
            </ReportGate>
          </ReportCard>

          {report.data ? (
            <StreakCards days={days} />
          ) : report.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Shimmer className="h-28" />
              <Shimmer className="h-28" />
            </div>
          ) : null}
        </div>

        {/* ------------------------------ right column ----------------------------- */}
        <div className="flex flex-col gap-4">
          <SectionHeading>Impact &amp; Growth Metrics</SectionHeading>

          <ReportCard title="Velocity Index" subtitle="Commit velocity · last 30 days" index={1} testId="velocity-card" footer={reportFooter}>
            <ReportGate query={report} skeleton={<VelocitySkeleton />}>
              {({ report: data }) => <VelocityContent days={days} starsByYear={data.starsByYear} />}
            </ReportGate>
          </ReportCard>

          <ReportCard
            title="Project Diversity Tree"
            subtitle="Language ecosystem"
            index={2}
            testId="tree-card"
            footer={
              repos.data ? (
                <>
                  <span>Primary stack &amp; projects · forks excluded</span>
                  <span>Powered by GitHub &amp; Supabase</span>
                </>
              ) : undefined
            }
          >
            {repos.error ? (
              <p role="status" className="py-8 text-center text-sm text-slate-500">{toAppError(repos.error).message}</p>
            ) : repos.isPending || !user ? (
              <BlockSkeleton label="Loading languages" />
            ) : (
              <LanguageTree login={user.login} avatarUrl={user.avatar_url} tree={tree} />
            )}
          </ReportCard>

          <ReportCard title="Collaboration Network" subtitle="Key repositories contributed to" index={3} testId="network-card" footer={reportFooter}>
            <ReportGate query={report} skeleton={<BlockSkeleton label="Mapping collaborators" className="[&>div:nth-child(2)]:h-64" />}>
              {({ report: data }) => (user ? <CollaborationNetwork login={user.login} avatarUrl={user.avatar_url} collaboration={data.collaboration} /> : null)}
            </ReportGate>
          </ReportCard>

          <ReportCard title="Community Sentiment" subtitle="Tone of recent pull request & issue conversations" index={4} testId="sentiment-card" footer={reportFooter}>
            <ReportGate query={report} skeleton={<BlockSkeleton label="Analysing sentiment" />}>
              {({ report: data }) => <SentimentCloud sentiment={data.sentiment} />}
            </ReportGate>
          </ReportCard>
        </div>
      </div>
    </motion.div>
  )
}
