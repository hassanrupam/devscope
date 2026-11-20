import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { GithubIcon, GlobeIcon, LinkedinIcon, MailIcon, SparklesIcon } from '@/components/ui/icons'

export const AUTHOR = {
  name: 'Hassan Rupam',
  portfolio: 'https://hassanrupam.vercel.app/',
  github: 'https://github.com/hassanrupam/',
  linkedin: 'https://www.linkedin.com/in/hassanrupam/',
  email: 'hassanrupam@gmail.com',
} as const

function FooterLink({ href, label, icon, external = true }: { href: string; label: string; icon: ReactNode; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/60 px-3 text-xs font-medium text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white hover:text-indigo-700 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-indigo-400/50 dark:hover:bg-white/[0.08] dark:hover:text-indigo-200"
    >
      <span className="text-slate-500 transition-colors group-hover:text-indigo-500 dark:text-slate-400 dark:group-hover:text-indigo-300">{icon}</span>
      {label}
    </a>
  )
}

/** The one footer of the app: who built and maintains DevExplore, and how to reach them. */
export function SiteFooter({ note }: { note?: string }) {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      aria-label="About the developer"
      className="relative mt-10 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-xl shadow-slate-900/[0.05] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gradient-to-b dark:from-slate-900/80 dark:to-slate-950/80 dark:shadow-black/40 sm:p-5"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/30" aria-hidden="true">
            HR
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
              Designed &amp; built by{' '}
              <a href={AUTHOR.portfolio} target="_blank" rel="noopener noreferrer" className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent hover:underline dark:from-indigo-300 dark:to-cyan-300">
                {AUTHOR.name}
              </a>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
                Active maintainer &amp; author
              </span>
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <SparklesIcon className="size-3.5 shrink-0 text-violet-500" />
              Found a bug or have an idea? Reach out — I read every message.
            </p>
          </div>
        </div>

        <nav aria-label="Contact the developer" className="flex flex-wrap gap-2">
          <FooterLink href={AUTHOR.portfolio} label="Portfolio" icon={<GlobeIcon className="size-4" />} />
          <FooterLink href={AUTHOR.github} label="GitHub" icon={<GithubIcon className="size-4" />} />
          <FooterLink href={AUTHOR.linkedin} label="LinkedIn" icon={<LinkedinIcon className="size-4" />} />
          <FooterLink href={`mailto:${AUTHOR.email}`} label={AUTHOR.email} icon={<MailIcon className="size-4" />} external={false} />
        </nav>
      </div>

      <p className="relative mt-4 border-t border-slate-200/70 pt-3 text-[0.7rem] leading-relaxed text-slate-500 dark:border-white/[0.06]">
        {note ?? 'Public data from the GitHub API. Profiles, repositories and searches are cached for a few days to stay within GitHub rate limits.'}{' '}
        <span className="whitespace-nowrap">© {new Date().getFullYear()} DevExplore</span>
      </p>
    </motion.footer>
  )
}
