import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ReportCard } from '@/features/report/components/ReportCard'
import { cn } from '@/lib/utils'
import { buildAlerts, burnRate, forecast, resourceRows, toCsv } from '../insights'
import {
  createRateLimitSession,
  fetchRateLimitHistory,
  fetchRateLimitLiveHistory,
  fetchRateLimits,
  type RateLimitData,
  type RateLimitSession,
  type RateLimitSnapshot,
} from '../rateLimitClient'
import { AdminLogin } from './AdminLogin'
import { AlertsPanel } from './AlertsPanel'
import { KpiStrip } from './KpiStrip'
import { QuotaHero } from './QuotaHero'
import { QuotaObservatory } from './QuotaObservatory'
import {
  LIVE_SAMPLE_INTERVAL_MS,
  LIVE_TREND_WINDOW_MS,
  RateLimitHistoryChart,
  type LiveRateSample,
  type RateLimitTrendMode,
} from './RateLimitHistoryChart'
import { ResourceGrid } from './ResourceGrid'
import { SystemStatus } from './SystemStatus'
import { UsageHeatmap3D } from './UsageHeatmap3D'


const SESSION_STORAGE_KEY = 'devexplore-rate-limit-session'

function appendLiveSample(samples: LiveRateSample[], sample: LiveRateSample): LiveRateSample[] {
  const timestamp = Math.floor(sample.timestamp / LIVE_SAMPLE_INTERVAL_MS) * LIVE_SAMPLE_INTERVAL_MS
  const normalized = { ...sample, timestamp }
  const recent = samples.filter((point) => point.timestamp >= timestamp - LIVE_TREND_WINDOW_MS)
  const latest = recent.at(-1)
  if (latest && timestamp - latest.timestamp < LIVE_SAMPLE_INTERVAL_MS) return recent
  return [...recent, normalized]
}

function mergeLiveSamples(
  current: LiveRateSample[],
  persisted: LiveRateSample[],
  now: number,
): LiveRateSample[] {
  const cutoff = now - LIVE_TREND_WINDOW_MS
  const samples = new Map<number, LiveRateSample>()
  for (const sample of [...persisted, ...current]) {
    const timestamp = Math.floor(sample.timestamp / LIVE_SAMPLE_INTERVAL_MS) * LIVE_SAMPLE_INTERVAL_MS
    if (timestamp < cutoff || timestamp > now) continue
    samples.set(timestamp, { timestamp, used: sample.used })
  }
  return [...samples.values()].sort((left, right) => left.timestamp - right.timestamp)
}

function readStoredSession(): RateLimitSession | null {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!stored) return null
    const value: unknown = JSON.parse(stored)
    if (
      typeof value === 'object' &&
      value !== null &&
      'token' in value &&
      typeof value.token === 'string' &&
      'expires_at' in value &&
      typeof value.expires_at === 'string' &&
      Date.parse(value.expires_at) > Date.now()
    ) {
      return { token: value.token, expires_at: value.expires_at }
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch (cause) {
    console.warn('Could not restore the rate-limit dashboard session.', cause)
  }
  return null
}

export function RateLimitDashboard() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState<RateLimitSession | null>(readStoredSession)
  const [data, setData] = useState<RateLimitData | null>(null)
  const [history, setHistory] = useState<RateLimitSnapshot[]>([])
  const [liveSamples, setLiveSamples] = useState<LiveRateSample[]>([])
  const [trendMode, setTrendMode] = useState<RateLimitTrendMode>('live')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [liveTrendError, setLiveTrendError] = useState<string | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [liveEnabled, setLiveEnabled] = useState(true)
  const activeRequest = useRef(0)

  async function refreshDashboard(sessionToken: string) {
    const requestId = activeRequest.current + 1
    activeRequest.current = requestId
    setError(null)
    setHistoryError(null)
    setIsLoading(true)
    try {
      const fetched = await fetchRateLimits(sessionToken)
      if (requestId !== activeRequest.current) return
      const sample = { timestamp: Date.now(), used: fetched.data.rate.used }
      setData(fetched.data)
      setUpdatedAt(new Date(sample.timestamp))
      setLiveSamples((current) => appendLiveSample(current, sample))
      setLiveTrendError(fetched.liveHistoryError)
      setHistoryError(null)
      setIsHistoryLoading(true)
      try {
        const snapshots = await fetchRateLimitHistory(sessionToken)
        if (requestId === activeRequest.current) setHistory(snapshots)
      } catch (cause) {
        if (requestId === activeRequest.current) {
          if (cause instanceof Error && cause.message.includes('session has expired')) {
            endSession(true)
          } else {
            setHistory([])
            setHistoryError(cause instanceof Error ? cause.message : 'Could not load historical rate-limit data.')
          }
        }
      }
      try {
        const snapshots = await fetchRateLimitLiveHistory(sessionToken)
        if (requestId === activeRequest.current) {
          setLiveSamples((current) => mergeLiveSamples(
            current,
            snapshots.map((snapshot) => ({
              timestamp: Date.parse(snapshot.captured_at),
              used: snapshot.payload.rate.used,
            })),
            Date.now(),
          ))
        }
      } catch (cause) {
        if (requestId === activeRequest.current) {
          if (cause instanceof Error && cause.message.includes('session has expired')) {
            endSession(true)
          } else {
            setLiveTrendError((current) => current ?? (cause instanceof Error
              ? cause.message
              : 'Could not load previous live trend data.'))
          }
        }
      } finally {
        if (requestId === activeRequest.current) setIsHistoryLoading(false)
      }
    } catch (cause) {
      if (requestId === activeRequest.current) {
        if (cause instanceof Error && cause.message.includes('session has expired')) endSession(true)
        else setError(cause instanceof Error ? cause.message : 'Could not load GitHub rate limits.')
      }
    } finally {
      if (requestId === activeRequest.current) setIsLoading(false)
    }
  }

  function endSession(expired = false) {
    activeRequest.current += 1
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
    } catch (cause) {
      console.warn('Could not clear the rate-limit dashboard session.', cause)
    }
    setSession(null)
    setUsername('')
    setPassword('')
    setData(null)
    setHistory([])
    setLiveSamples([])
    setUpdatedAt(null)
    setError(expired ? 'Your dashboard session expired. Please sign in again.' : null)
    setHistoryError(null)
    setLiveTrendError(null)
    setIsLoading(false)
    setIsHistoryLoading(false)
  }

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsAuthenticating(true)
    try {
      const nextSession = await createRateLimitSession(username, password)
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
      setUsername('')
      setPassword('')
      setSession(nextSession)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in to the dashboard.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  useEffect(() => {
    if (!session) return
    void refreshDashboard(session.token)
  }, [session?.token])

  useEffect(() => {
    if (!session || !data || trendMode !== 'live' || !liveEnabled) return

    let cancelled = false
    let requestInFlight = false
    const pollLiveRateLimit = async () => {
      if (cancelled || requestInFlight || document.visibilityState === 'hidden') return
      requestInFlight = true
      try {
        const fetched = await fetchRateLimits(session.token)
        if (cancelled) return
        const sample = { timestamp: Date.now(), used: fetched.data.rate.used }
        setData(fetched.data)
        setUpdatedAt(new Date(sample.timestamp))
        setLiveSamples((current) => appendLiveSample(current, sample))
        setLiveTrendError(fetched.liveHistoryError)
      } catch (cause) {
        if (cancelled) return
        if (cause instanceof Error && cause.message.includes('session has expired')) {
          endSession(true)
        } else {
          setLiveTrendError(cause instanceof Error ? cause.message : 'Could not refresh the live rate-limit trend.')
        }
      } finally {
        requestInFlight = false
      }
    }

    const timer = window.setInterval(() => void pollLiveRateLimit(), LIVE_SAMPLE_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [session?.token, data !== null, trendMode, liveEnabled])

  useEffect(() => {
    if (!session) return
    const remaining = Date.parse(session.expires_at) - Date.now()
    if (remaining <= 0) {
      endSession(true)
      return
    }
    const timer = window.setTimeout(() => endSession(true), remaining)
    return () => window.clearTimeout(timer)
  }, [session?.expires_at])


  const now = updatedAt?.getTime() ?? 0
  const rows = useMemo(() => (data ? resourceRows(data) : []), [data])
  const burn = useMemo(() => burnRate(liveSamples, now), [liveSamples, now])
  const projection = useMemo(() => (data && burn !== null ? forecast(data.rate, burn, now) : null), [data, burn, now])
  const alerts = useMemo(() => (data ? buildAlerts(data, burn, now) : []), [data, burn, now])

  function exportCsv() {
    if (!data) return
    const url = URL.createObjectURL(new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `github-rate-limits-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-6 sm:px-6 sm:py-10 lg:px-8 xl:px-10 2xl:px-12">
      <header className="relative isolate mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/3 -top-8 -z-10 h-48 w-2/3 max-w-4xl -translate-x-1/2 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/15" />
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-3xl">
            GitHub API <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent dark:from-indigo-300 dark:to-cyan-300">Analytics</span>
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Private DevExplore rate-limit dashboard
            {session ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                <span aria-hidden="true" className={cn('size-1.5 rounded-full bg-emerald-500', liveEnabled && 'animate-pulse motion-reduce:animate-none')} />
                {liveEnabled ? 'Live' : 'Paused'}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session ? (
            <>
              <Button type="button" onClick={() => void refreshDashboard(session.token)} disabled={isLoading} className="px-3 text-xs sm:px-4 sm:text-sm">
                {isLoading ? 'Refreshing…' : <><span className="sm:hidden">Refresh</span><span className="hidden sm:inline">Global refresh</span></>}
              </Button>
              <Button
                type="button"
                onClick={() => endSession()}
                aria-label="Lock dashboard"
                title="Lock dashboard"
                className="border-slate-200 bg-slate-100 px-2 text-slate-700 shadow-none hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-3"
              >
                Lock
              </Button>
            </>
          ) : null}
          <div className="relative size-10 shrink-0">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full flex-1 space-y-6">
        {!session ? (
          <AdminLogin
            username={username}
            password={password}
            onUsername={setUsername}
            onPassword={setPassword}
            onSubmit={startSession}
            isAuthenticating={isAuthenticating}
            error={error}
          />
        ) : null}

        {session && !data ? (
          <div role="status" className="dashboard-enter space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="r-shimmer h-24 rounded-2xl" />)}
            </div>
            <div className="r-shimmer h-72 rounded-2xl" />
            <p className="text-center text-sm text-slate-600 dark:text-slate-300">Restoring your dashboard session…</p>
          </div>
        ) : null}

        {session && error ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {data && session ? (
          <div className={cn('space-y-8', isLoading ? 'opacity-70' : 'dashboard-enter', 'transition-opacity duration-300')}>
            <KpiStrip core={data.rate} burn={burn} projection={projection} now={now} />
            <AlertsPanel alerts={alerts} />

            <section aria-labelledby="primary-quota-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 id="primary-quota-heading" className="text-lg font-semibold">Primary quota: Core (REST API)</h2>
                {updatedAt ? <p className="text-xs text-slate-500 dark:text-slate-400">Updated {updatedAt.toLocaleTimeString()}</p> : null}
              </div>
              <QuotaHero resource={data.rate} historyError={historyError}>
                <RateLimitHistoryChart
                  snapshots={history}
                  liveSamples={liveSamples}
                  mode={trendMode}
                  onModeChange={setTrendMode}
                  isLoading={isHistoryLoading}
                  liveError={liveTrendError}
                />
              </QuotaHero>
            </section>

            <section aria-labelledby="observatory-heading">
              <h2 id="observatory-heading" className="mb-3 text-lg font-semibold">Quota observatory</h2>
              <div className="grid gap-4 xl:grid-cols-2">
                <ReportCard title="Quota by resource" subtitle="3D view of every GitHub API quota" index={1}>
                  <QuotaObservatory rows={rows} />
                </ReportCard>
                <ReportCard title="Core usage heatmap" subtitle="Busiest moment per hour · last 10 days" index={2}>
                  <UsageHeatmap3D snapshots={history} loading={isHistoryLoading} />
                </ReportCard>
              </div>
            </section>

            <section aria-labelledby="resource-quotas-heading">
              <div className="mb-3">
                <h2 id="resource-quotas-heading" className="text-lg font-semibold">Resource quotas</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Usage by GitHub API resource · sparklines show your saved history</p>
              </div>
              <ResourceGrid rows={rows} history={history} />
            </section>

            <section aria-labelledby="admin-heading">
              <h2 id="admin-heading" className="mb-3 text-lg font-semibold">Admin &amp; system</h2>
              <ReportCard label="Admin and system status" index={3}>
                <SystemStatus
                  expiresAt={session.expires_at}
                  snapshots={history}
                  liveError={liveTrendError}
                  historyError={historyError}
                  liveEnabled={liveEnabled}
                  onLiveEnabled={setLiveEnabled}
                  onExport={exportCsv}
                  onRefresh={() => void refreshDashboard(session.token)}
                  onLock={() => endSession()}
                  isLoading={isLoading}
                />
              </ReportCard>
            </section>
          </div>
        ) : null}
      </main>

      <footer className="mx-auto mt-10 max-w-prose text-center text-xs text-slate-500 sm:mt-12">
        Live trend samples are collected every 5 seconds while its tab is active. Hourly history uses saved snapshots collected every 30 minutes and retained for 10 days.
      </footer>
    </div>
  )
}
