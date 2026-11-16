import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

const MESSAGES = [
  'Reading the contribution calendar…',
  'Measuring commit velocity…',
  'Mapping collaborators…',
  'Listening to the community tone…',
  'Assembling the report…',
]

/** Indeterminate progress line + rotating status text, shown while the report is being built. */
export function ReportProgress({ active }: { active: boolean }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), 1800)
    return () => window.clearInterval(id)
  }, [active])

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="progress"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="r-no-print mx-auto w-full max-w-md overflow-hidden"
        >
          <div className="relative h-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
            <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-400" style={{ animation: 'r-sweep 1.4s cubic-bezier(0.4,0,0.2,1) infinite' }} />
          </div>
          <div className="relative mt-2 h-5 text-center text-xs text-slate-500 dark:text-slate-400">
            <AnimatePresence mode="wait">
              <motion.span key={index} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="absolute inset-x-0">
                {MESSAGES[index]}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
