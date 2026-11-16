import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRightIcon, SparklesIcon } from '@/components/ui/icons'
import { reportService } from '../reportService'

interface ReportCtaProps {
  username: string
  onOpen: (username: string) => void
}

/**
 * Entry point on a profile. Hovering or focusing it warms the report (shared cache first, GitHub only
 * if nobody has loaded it recently), so the page usually opens already populated.
 */
export function ReportCta({ username, onOpen }: ReportCtaProps) {
  const queryClient = useQueryClient()
  const warm = () =>
    void queryClient.prefetchQuery({
      queryKey: ['report', username.toLowerCase()],
      queryFn: () => reportService.getReport(username),
      staleTime: 30 * 60 * 1000,
    })

  return (
    <motion.button
      type="button"
      data-testid="open-report"
      onClick={() => onOpen(username)}
      onPointerEnter={warm}
      onFocus={warm}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      className="group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition-shadow hover:shadow-xl hover:shadow-violet-500/35"
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <SparklesIcon className="relative size-4" />
      <span className="relative">View full report</span>
      <ArrowRightIcon className="relative size-4 transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  )
}
