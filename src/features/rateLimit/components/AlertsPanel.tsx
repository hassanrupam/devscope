import { AnimatePresence, motion } from 'framer-motion'
import type { Alert } from '../insights'

const STYLE = {
  critical: { color: '#f87171', icon: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z', tag: 'Critical' },
  warning: { color: '#fbbf24', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', tag: 'Watch' },
  info: { color: '#34d399', icon: 'M5 13l4 4L19 7', tag: 'OK' },
} as const

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <section aria-label="Insights" className="space-y-2">
      <AnimatePresence initial={false}>
        {alerts.slice(0, 4).map((alert) => {
          const s = STYLE[alert.level]
          return (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur"
              style={{ borderColor: `${s.color}55`, background: `linear-gradient(90deg, ${s.color}1f, transparent 70%)` }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-5 shrink-0">
                <path d={s.icon} />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{alert.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{alert.detail}</p>
              </div>
              <span className="hidden rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider sm:inline" style={{ background: `${s.color}26`, color: s.color }}>{s.tag}</span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </section>
  )
}
