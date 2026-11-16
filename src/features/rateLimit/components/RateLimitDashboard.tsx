import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { isGitHubProxyEnabled } from '@/config'
import { cn, formatCount } from '@/lib/utils'
import {
  createRateLimitSession,
  fetchRateLimitHistory,
  fetchRateLimitLiveHistory,
  fetchRateLimits,
  type RateLimitData,
  type RateLimitResource,
  type RateLimitSession,
  type RateLimitSnapshot,
} from '../rateLimitClient'
import {
  LIVE_SAMPLE_INTERVAL_MS,
  LIVE_TREND_WINDOW_MS,
  RateLimitHistoryChart,
  type LiveRateSample,
  type RateLimitTrendMode,
} from './RateLimitHistoryChart'

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

const resourcePalettes = {
  cyan: { line: '#22d3ee', start: '#22d3ee', end: '#3b82f6' },
  violet: { line: '#a78bfa', start: '#8b5cf6', end: '#c084fc' },
  purple: { line: '#c084fc', start: '#a855f7', end: '#ec4899' },
  green: { line: '#4ade80', start: '#22c55e', end: '#34d399' },
} as const

function getResourcePalette(name: string) {
  if (name.includes('graphql')) return resourcePalettes.violet
  if (name.includes('audit') || name.includes('integration')) return resourcePalettes.purple
  if (name.includes('code') || name.includes('copilot') || name.includes('dependency') || name === 'core') {
    return resourcePalettes.green
  }
  return resourcePalettes.cyan
}

function ResourceSparkline({
  name,
  values,
  color,
}: {
  name: string
  values: number[]
  color: string
}) {
  const gradientId = `resource-${name}-${useId().replaceAll(':', '')}`
  if (values.length < 2) {
    return (
      <div className="flex h-11 min-w-0 flex-1 items-center justify-end text-[10px] text-slate-400 dark:text-slate-500">
        Trend collecting
      </div>
    )
  }

  return (
    <div aria-hidden="true" className="h-11 min-w-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={values.map((used) => ({ used }))}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="used"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive="auto"
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ResourceCard({
  name,
  resource,
  history,
}: {
  name: string
  resource: RateLimitResource
  history: RateLimitSnapshot[]
}) {
  const percent = resource.limit > 0 ? Math.min(100, (resource.used / resource.limit) * 100) : 0
  const label = name === 'scim' ? 'SCIM' : name.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const palette = getResourcePalette(name)
  const values = history.flatMap((snapshot) => {
    const value = snapshot.payload.resources[name]?.used
    return value === undefined ? [] : [value]
  })

  return (
    <Card
      className="group relative overflow-hidden border-slate-200/80 bg-white/80 p-4 shadow-md shadow-slate-900/[0.03] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10 dark:border-slate-700/80 dark:bg-slate-900/80 dark:shadow-black/20 dark:hover:shadow-black/40 sm:p-5"
      style={{ borderColor: `${palette.line}50` }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-16 size-36 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20"
        style={{ backgroundColor: palette.line }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold sm:text-[15px]">{label}</h3>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {formatCount(resource.remaining)} remaining
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
          {percent < 1 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`} used
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${label} quota used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${formatCount(resource.used)} of ${formatCount(resource.limit)} used`}
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200/90 shadow-inner dark:bg-slate-700/80"
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${percent}%`,
            background: `linear-gradient(90deg, ${palette.start}, ${palette.end})`,
            boxShadow: `0 0 14px ${palette.line}80`,
          }}
        />
      </div>
      <div className="mt-3 flex items-end gap-3">
        <div className="relative h-12 w-[76px] shrink-0">
          <svg aria-hidden="true" viewBox="0 0 88 52" className="h-full w-full">
            <path d="M 9 44 A 35 35 0 0 1 79 44" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-slate-200 dark:text-slate-700" />
            <path
              d="M 9 44 A 35 35 0 0 1 79 44"
              fill="none"
              stroke={palette.line}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * 110} 110`}
              vectorEffect="non-scaling-stroke"
            />
            <text x="44" y="39" textAnchor="middle" className="fill-slate-800 text-[15px] font-semibold dark:fill-slate-100">
              {formatCount(resource.used)}
            </text>
          </svg>
        </div>
        <ResourceSparkline name={name} values={values} color={palette.line} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-[10px] text-slate-500 dark:border-slate-700/80 dark:text-slate-400 sm:text-[11px]">
        <span className="uppercase tracking-wider">Reset countdown</span>
        <span className="flex items-center gap-1">
          <span>Reset:</span>
          <ResetCountdown reset={resource.reset} label={`${label} reset countdown`} compact />
        </span>
      </div>
    </Card>
  )
}

function ResetCountdown({
  reset,
  label,
  compact = false,
}: {
  reset: number
  label: string
  compact?: boolean
}) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (reset <= 0) {
    return (
      <span role="timer" aria-label={label} className="font-mono text-xs text-slate-400">
        —
      </span>
    )
  }

  const totalSeconds = Math.max(0, Math.floor((reset * 1000 - now) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const formatted = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')

  return (
    <span
      role="timer"
      aria-label={label}
      aria-valuetext={`${hours} hours, ${minutes} minutes, ${seconds} seconds`}
      className={cn(
        'font-mono font-semibold tabular-nums',
        compact
          ? 'text-[11px] tracking-tight text-slate-600 dark:text-slate-300'
          : 'text-3xl tracking-tight text-slate-950 dark:text-white sm:text-4xl',
      )}
    >
      {formatted}
    </span>
  )
}

function PrimaryQuotaCard({
  resource,
  history,
  isHistoryLoading,
  historyError,
  liveSamples,
  trendMode,
  onTrendModeChange,
  liveTrendError,
}: {
  resource: RateLimitResource
  history: RateLimitSnapshot[]
  isHistoryLoading: boolean
  historyError: string | null
  liveSamples: LiveRateSample[]
  trendMode: RateLimitTrendMode
  onTrendModeChange: (mode: RateLimitTrendMode) => void
  liveTrendError: string | null
}) {
  const percent = resource.limit > 0 ? Math.min(100, (resource.used / resource.limit) * 100) : 0
  const reset = resource.reset > 0 ? new Date(resource.reset * 1000) : null
  const resetDateTime = reset?.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
  const arcLength = 283

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white/80 p-0 shadow-xl shadow-slate-900/[0.04] dark:border-slate-700/80 dark:bg-slate-900/75 dark:shadow-black/30">
      <div className="relative grid items-center gap-5 p-4 sm:grid-cols-2 sm:p-6 lg:gap-10">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-24 size-64 rounded-full bg-emerald-400/10 blur-3xl dark:bg-cyan-400/10" />
        <div className="relative flex flex-col items-center">
          <svg
            role="meter"
            aria-label="Primary core quota used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-valuetext={`${formatCount(resource.used)} of ${formatCount(resource.limit)} used`}
            viewBox="0 0 220 130"
            className="h-36 w-full max-w-[340px] sm:h-40"
          >
            <defs>
              <linearGradient id="primary-quota-gradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="55%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#fb923c" />
              </linearGradient>
            </defs>
            <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-slate-200 dark:text-slate-800" />
            <path
              d="M 20 110 A 90 90 0 0 1 200 110"
              fill="none"
              stroke="url(#primary-quota-gradient)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * arcLength} ${arcLength}`}
              filter="drop-shadow(0 0 5px #22d3ee70)"
              vectorEffect="non-scaling-stroke"
            />
            <text x="110" y="82" textAnchor="middle" className="fill-slate-500 text-[14px] dark:fill-slate-400">Used</text>
            <text x="110" y="104" textAnchor="middle" className="fill-slate-950 text-[16px] font-semibold dark:fill-white">
              {formatCount(resource.used)} / {formatCount(resource.limit)}
            </text>
          </svg>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
            {formatCount(resource.remaining)} remaining · {percent.toFixed(2)}% used
          </p>
        </div>
        <div className="relative flex min-h-36 flex-col items-center justify-center border-t border-slate-200/80 pt-5 text-center dark:border-slate-700/80 sm:min-h-44 sm:border-l sm:border-t-0 sm:py-4 sm:pl-8">
          <p className="relative text-sm font-medium text-slate-500 dark:text-slate-400">Reset in:</p>
          <div className="relative mt-1 flex min-h-24 w-full items-center justify-center">
            <svg
              aria-hidden="true"
              viewBox="0 0 360 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-full w-full max-w-[360px] overflow-visible"
            >
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
            {reset ? (
              <ResetCountdown reset={resource.reset} label="Primary Core reset countdown" />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Not available</p>
            )}
          </div>
          <p className="relative mt-1 text-xs text-slate-500 dark:text-slate-400">
            Reset: <span className="font-medium tabular-nums">{resetDateTime ?? '—'}</span>
          </p>
        </div>
      </div>
      {historyError ? (
        <p role="alert" className="mx-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200 sm:mx-6">
          Historical usage could not be loaded: {historyError}
        </p>
      ) : null}
      <RateLimitHistoryChart
        snapshots={history}
        liveSamples={liveSamples}
        mode={trendMode}
        onModeChange={onTrendModeChange}
        isLoading={isHistoryLoading}
        liveError={liveTrendError}
      />
    </Card>
  )
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
    if (!session || !data || trendMode !== 'live') return

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
  }, [session?.token, data !== null, trendMode])

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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-6 sm:px-6 sm:py-10 lg:px-8 xl:px-10 2xl:px-12">
      <header className="relative isolate mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/3 -top-8 -z-10 h-48 w-2/3 max-w-4xl -translate-x-1/2 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/15"
        />
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-3xl">
            GitHub API <span className="text-indigo-600 dark:text-indigo-400">Analytics</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Private DevExplore rate-limit dashboard</p>
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
          <Card className="dashboard-enter p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Sign in to view rate limits</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Sign in once per tab. A signed session lasts 12 hours; your password is not stored, and the GitHub token never reaches your browser.
                </p>
              </div>
            </div>

            <form onSubmit={startSession} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label htmlFor="rate-limit-username" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Dashboard username
                </label>
                <input
                  id="rate-limit-username"
                  type="text"
                  autoComplete="off"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300/80 bg-white/80 px-3 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="rate-limit-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Dashboard password
                </label>
                <input
                  id="rate-limit-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300/80 bg-white/80 px-3 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
                />
              </div>
              <Button type="submit" disabled={isAuthenticating}>
                {isAuthenticating ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            {!isGitHubProxyEnabled ? (
              <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                The dashboard requires the server-side GitHub proxy. Enable <code>VITE_GITHUB_PROXY=true</code> and configure the Supabase secrets before use.
              </p>
            ) : null}
          </Card>
        ) : null}

        {session && !data ? (
          <Card className="dashboard-enter p-10 text-center" role="status">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 motion-reduce:animate-none dark:border-slate-700 dark:border-t-indigo-400" />
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Restoring your dashboard session…</p>
          </Card>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {data ? (
          <div className={cn('space-y-6', isLoading ? 'opacity-70' : 'dashboard-enter', 'transition-opacity duration-300')}>
            <section aria-labelledby="primary-quota-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 id="primary-quota-heading" className="text-lg font-semibold">Primary quota: Core (REST API)</h2>
                {updatedAt ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Updated {updatedAt.toLocaleTimeString()}</p>
                ) : null}
              </div>
              <PrimaryQuotaCard
                resource={data.rate}
                history={history}
                isHistoryLoading={isHistoryLoading}
                historyError={historyError}
                liveSamples={liveSamples}
                trendMode={trendMode}
                onTrendModeChange={setTrendMode}
                liveTrendError={liveTrendError}
              />
            </section>

            <section aria-labelledby="resource-quotas-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="resource-quotas-heading" className="text-lg font-semibold">Resource quotas</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Usage by GitHub API resource · sparklines show your saved history
                  </p>
                </div>
                {updatedAt ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Updated {updatedAt.toLocaleTimeString()}</p>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(data.resources)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([name, resource]) => (
                    <ResourceCard key={name} name={name} resource={resource} history={history} />
                  ))}
              </div>
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
