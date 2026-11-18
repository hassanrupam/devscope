import { motion } from 'framer-motion'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { isGitHubProxyEnabled } from '@/config'
import { cn } from '@/lib/utils'

interface AdminLoginProps {
  username: string
  password: string
  onUsername: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isAuthenticating: boolean
  error: string | null
}

const TRUST = [
  { icon: 'M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', text: '12-hour signed session, per tab' },
  { icon: 'M16 11V7a4 4 0 0 0-8 0v4m-1 0h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z', text: 'Password is never stored' },
  { icon: 'M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Z', text: 'GitHub token stays on the server' },
] as const

const inputClass =
  'h-12 w-full rounded-xl border border-slate-300/80 bg-white/70 px-3.5 text-base shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-indigo-400'

export function AdminLogin({ username, password, onUsername, onPassword, onSubmit, isAuthenticating, error }: AdminLoginProps) {
  const [reveal, setReveal] = useState(false)
  const [caps, setCaps] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  if (error !== lastError) {
    setLastError(error)
    if (error) setShakeKey((k) => k + 1)
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => setCaps(event.getModifierState('CapsLock'))

  return (
    <div className="relative isolate mx-auto flex min-h-[70vh] w-full items-center justify-center py-6">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="r-aurora absolute left-1/2 top-1/3 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-3xl dark:bg-indigo-500/25" />
        <div className="r-aurora absolute left-[20%] top-2/3 size-80 rounded-full bg-cyan-400/15 blur-3xl [animation-delay:-6s] dark:bg-cyan-400/15" />
        <div className="r-aurora absolute right-[15%] top-1/4 size-72 rounded-full bg-fuchsia-500/10 blur-3xl [animation-delay:-11s]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <motion.div
          key={shakeKey}
          animate={shakeKey > 0 ? { x: [0, -10, 9, -6, 4, 0] } : undefined}
          transition={{ duration: 0.45 }}
          className="rounded-3xl border border-slate-200/80 bg-white/75 p-6 shadow-2xl shadow-indigo-900/10 backdrop-blur-xl dark:border-white/[0.08] dark:bg-slate-900/70 dark:shadow-black/50 sm:p-8"
        >
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/40">
              <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-2xl bg-indigo-500/30 [animation-duration:3s] motion-reduce:hidden" />
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="relative size-7">
                <path d="M16 11V7a4 4 0 0 0-8 0v4M7 11h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" />
              </svg>
            </div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin console</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">Sign in to view rate limits</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Live GitHub API quotas, forecasts and usage history. Restricted to DevExplore administrators.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="rate-limit-username" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Dashboard username
              </label>
              <input id="rate-limit-username" type="text" autoComplete="off" required value={username} onChange={(e) => onUsername(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="rate-limit-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Dashboard password
              </label>
              <div className="relative">
                <input
                  id="rate-limit-password"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => onPassword(e.target.value)}
                  onKeyDown={onKey}
                  onKeyUp={onKey}
                  onBlur={() => setCaps(false)}
                  className={cn(inputClass, 'pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  aria-pressed={reveal}
                  className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                    {reveal ? <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4 9.5 7a12 12 0 0 1-2.6 3.9M6.1 6.1A12 12 0 0 0 2.5 12c1 3 4.5 7 9.5 7a9.7 9.7 0 0 0 4-.9" /> : <><path d="M2.5 12C3.5 9 7 5 12 5s8.5 4 9.5 7c-1 3-4.5 7-9.5 7s-8.5-4-9.5-7Z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
              {caps ? <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-300">Caps Lock is on</p> : null}
            </div>

            {error ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-950/50 dark:text-red-200">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={isAuthenticating} className="h-12 w-full rounded-xl text-base">
              {isAuthenticating ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {!isGitHubProxyEnabled ? (
            <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              The dashboard requires the server-side GitHub proxy. Enable <code>VITE_GITHUB_PROXY=true</code> and configure the Supabase secrets before use.
            </p>
          ) : null}

          <ul className="mt-6 space-y-2 border-t border-slate-200/80 pt-5 text-xs text-slate-600 dark:border-white/[0.08] dark:text-slate-400">
            {TRUST.map((item) => (
              <li key={item.text} className="flex items-center gap-2.5">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-emerald-500">
                  <path d={item.icon} />
                </svg>
                {item.text}
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>
    </div>
  )
}
