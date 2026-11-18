import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '../insights'
import type { RateLimitSnapshot } from '../rateLimitClient'

interface Props {
  expiresAt: string
  snapshots: RateLimitSnapshot[]
  liveError: string | null
  historyError: string | null
  liveEnabled: boolean
  onLiveEnabled: (value: boolean) => void
  onExport: () => void
  onRefresh: () => void
  onLock: () => void
  isLoading: boolean
}

const SESSION_MS = 12 * 60 * 60 * 1000

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="flex items-center gap-2 font-medium tabular-nums">
        {tone ? <span aria-hidden="true" className={`size-2 rounded-full ${tone === 'ok' ? 'bg-emerald-400' : 'bg-amber-400'}`} /> : null}
        {value}
      </dd>
    </div>
  )
}

export function SystemStatus({ expiresAt, snapshots, liveError, historyError, liveEnabled, onLiveEnabled, onExport, onRefresh, onLock, isLoading }: Props) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const left = Math.max(0, Date.parse(expiresAt) - now)
  const pct = Math.min(100, (left / SESSION_MS) * 100)
  const last = snapshots.reduce<number | null>((m, s) => Math.max(m ?? 0, Date.parse(s.captured_at)), null)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold">Session &amp; data health</h3>
        <dl className="mt-2 divide-y divide-slate-200/80 dark:divide-white/[0.08]">
          <Row label="Session expires in" value={formatDuration(left)} tone={left > 30 * 60_000 ? 'ok' : 'warn'} />
          <Row label="Live sample storage" value={liveError ? 'Degraded' : 'Operational'} tone={liveError ? 'warn' : 'ok'} />
          <Row label="Hourly history" value={historyError ? 'Unavailable' : `${snapshots.length} snapshots`} tone={historyError ? 'warn' : 'ok'} />
          <Row label="Last snapshot" value={last ? new Date(last).toLocaleString() : 'None yet'} />
        </dl>
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--r-track)' }}>
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-[width] duration-1000" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Controls</h3>
        <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 px-3 py-2.5 text-sm dark:border-white/[0.08]">
          <span>
            Auto-refresh every 5 s
            <span className="block text-xs text-slate-500 dark:text-slate-400">Pauses while this tab is hidden</span>
          </span>
          <input type="checkbox" role="switch" checked={liveEnabled} onChange={(e) => onLiveEnabled(e.target.checked)} className="size-5 accent-indigo-500" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={onRefresh} disabled={isLoading} className="text-xs sm:text-sm">{isLoading ? 'Refreshing…' : 'Refresh now'}</Button>
          <Button type="button" onClick={onExport} className="border-slate-200 bg-slate-100 text-xs text-slate-700 shadow-none hover:bg-slate-200 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 sm:text-sm">Export CSV</Button>
          <Button type="button" onClick={onLock} className="border-red-200 bg-red-50 text-xs text-red-700 shadow-none hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 sm:text-sm">End session</Button>
        </div>
      </div>
    </div>
  )
}
