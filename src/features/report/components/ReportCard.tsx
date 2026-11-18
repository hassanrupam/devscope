import { motion } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { CacheMeta } from '@/services/cache/cacheFirst'

interface ReportCardProps {
  /** Omit for a card that renders its own header (then pass `label` for accessibility). */
  title?: string
  label?: string
  subtitle?: string
  /** Small control shown at the top right (e.g. a toggle or a badge). */
  action?: ReactNode
  footer?: ReactNode
  /** Position in the page's reveal sequence; later cards enter slightly later. */
  index?: number
  className?: string
  bodyClassName?: string
  children: ReactNode
  testId?: string
}

/**
 * Glass card used by every report section: staggered entrance, a soft spotlight that follows the
 * pointer, and a consistent header/footer so the page reads as one system.
 */
export function ReportCard({ title, label, subtitle, action, footer, index = 0, className, bodyClassName, children, testId }: ReportCardProps) {
  const ref = useRef<HTMLElement>(null)

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    el.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }

  return (
    <motion.section
      ref={ref}
      data-testid={testId}
      aria-label={title ?? label}
      onPointerMove={onPointerMove}
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: Math.min(index, 8) * 0.09, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'r-print-card group relative flex flex-col overflow-hidden rounded-2xl border p-4 sm:p-5',
        'border-slate-200/80 bg-white/80 shadow-xl shadow-slate-900/[0.05] backdrop-blur-xl',
        'dark:border-white/[0.08] dark:bg-gradient-to-b dark:from-slate-900/80 dark:to-slate-950/80 dark:shadow-black/40',
        className,
      )}
    >
      {/* top hairline + pointer spotlight */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: 'radial-gradient(420px circle at var(--mx, 50%) var(--my, 0%), rgb(129 140 248 / 0.10), transparent 60%)' }}
      />

      {title ? (
        <header className="relative mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h3>
            {subtitle ? <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          </div>
          {action ? <div className="r-no-print shrink-0">{action}</div> : null}
        </header>
      ) : null}

      <div className={cn('relative flex-1', bodyClassName)}>{children}</div>

      {footer ? (
        <footer className="relative mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200/70 pt-3 text-[0.7rem] text-slate-500 dark:border-white/[0.06] dark:text-slate-500">
          {footer}
        </footer>
      ) : null}
    </motion.section>
  )
}

/** "Updated 3 hours ago · cached until Nov 17, 9:00 AM" + attribution, matching the mockup's card footers. */
export function CardFooter({ meta, ttlMs }: { meta: CacheMeta | undefined; ttlMs: number }) {
  if (!meta) return <span>Powered by GitHub &amp; Supabase</span>
  const until = new Date(meta.fetchedAt.getTime() + ttlMs)
  return (
    <>
      <span>
        {meta.stale ? 'Showing saved copy' : `Updated ${formatRelativeTime(meta.fetchedAt)}`}
        {meta.cacheStatus === 'unavailable' ? ' · live from GitHub' : ` · cached until ${until.toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
      </span>
      <span>Powered by GitHub &amp; Supabase</span>
    </>
  )
}
