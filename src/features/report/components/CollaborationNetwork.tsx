import { AnimatePresence, motion } from 'framer-motion'
import { useId, useMemo, useState } from 'react'
import { cn, formatCount } from '@/lib/utils'
import type { Report } from '@/services/github/schema'
import { useInViewOnce } from '../hooks'
import { layoutNetwork } from '../networkLayout'

const W = 560
const H = 380
const OWN = '#a78bfa'
const EXTERNAL = '#38bdf8'

interface Props {
  login: string
  avatarUrl: string
  collaboration: Report['collaboration']
}

export function CollaborationNetwork({ login, avatarUrl, collaboration }: Props) {
  const id = useId().replace(/:/g, '')
  const [ref, seen] = useInViewOnce<HTMLDivElement>()
  const [active, setActive] = useState<string | null>(null)
  const layout = useMemo(() => layoutNetwork(collaboration.repos, { width: W, height: H }), [collaboration.repos])
  const activeRepo = layout.repos.find((r) => r.repo.nameWithOwner === active)

  if (collaboration.repos.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No public repository collaboration found in the last year.</p>
  }

  return (
    <div ref={ref} className="space-y-3">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Collaboration network of ${login}: ${collaboration.repos.map((r) => r.nameWithOwner).join(', ')}`}>
          <defs>
            <clipPath id={`${id}-c`}><circle cx={layout.center.x} cy={layout.center.y} r={26} /></clipPath>
            {layout.repos.map((r, i) => (
              <clipPath key={r.repo.nameWithOwner} id={`${id}-r${i}`}><circle cx={r.x} cy={r.y} r={r.r - 2} /></clipPath>
            ))}
            {layout.repos.flatMap((r, i) =>
              r.people.map((p, k) => (
                <clipPath key={`${i}-${p.login}`} id={`${id}-p${i}-${k}`}><circle cx={p.x} cy={p.y} r={9} /></clipPath>
              )),
            )}
          </defs>

          {layout.repos.map((r, i) => {
            const color = r.repo.external ? EXTERNAL : OWN
            const dim = active !== null && active !== r.repo.nameWithOwner
            return (
              <g key={r.repo.nameWithOwner} style={{ opacity: dim ? 0.25 : 1, transition: 'opacity 0.25s' }}>
                {/* edge from the developer to the repository, with a travelling pulse */}
                <motion.path d={`M${layout.center.x} ${layout.center.y} L${r.x} ${r.y}`} stroke={color} strokeOpacity={0.55} strokeWidth={r.strokeWidth} strokeLinecap="round" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 0.9, delay: 0.25 + i * 0.1, ease: 'easeOut' }} />
                <path d={`M${layout.center.x} ${layout.center.y} L${r.x} ${r.y}`} stroke="white" strokeOpacity={0.9} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="2 34" fill="none" style={{ animation: `r-dash 2.6s linear ${i * 0.35}s infinite`, opacity: seen ? 1 : 0 }} />

                {r.people.map((p, k) => (
                  <g key={p.login}>
                    <motion.path d={`M${r.x} ${r.y} L${p.x} ${p.y}`} stroke={color} strokeOpacity={0.3} strokeWidth={1} fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 0.6, delay: 0.9 + i * 0.1 + k * 0.05 }} />
                    <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: seen ? 1 : 0, opacity: seen ? 1 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 1.2 + i * 0.1 + k * 0.05 }} style={{ transformOrigin: `${p.x}px ${p.y}px`, transformBox: 'view-box' }}>
                      <a href={`https://github.com/${encodeURIComponent(p.login)}`} target="_blank" rel="noopener noreferrer">
                        <circle cx={p.x} cy={p.y} r={10} style={{ fill: 'var(--r-empty)', stroke: color, strokeOpacity: 0.6 }} strokeWidth={1} />
                        <image href={p.avatarUrl} x={p.x - 9} y={p.y - 9} width={18} height={18} clipPath={`url(#${id}-p${i}-${k})`} preserveAspectRatio="xMidYMid slice" />
                        <title>{p.login}</title>
                      </a>
                    </motion.g>
                  </g>
                ))}

                <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: seen ? 1 : 0, opacity: seen ? 1 : 0 }} transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.5 + i * 0.1 }} style={{ transformOrigin: `${r.x}px ${r.y}px`, transformBox: 'view-box' }}>
                  <a href={r.repo.url} target="_blank" rel="noopener noreferrer" onPointerEnter={() => setActive(r.repo.nameWithOwner)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(r.repo.nameWithOwner)} onBlur={() => setActive(null)}>
                    <circle cx={r.x} cy={r.y} r={r.r} style={{ fill: 'var(--r-empty)', stroke: color, filter: `drop-shadow(0 0 6px ${color}88)` }} strokeWidth={2} />
                    <image href={r.repo.ownerAvatar} x={r.x - r.r + 2} y={r.y - r.r + 2} width={(r.r - 2) * 2} height={(r.r - 2) * 2} clipPath={`url(#${id}-r${i})`} preserveAspectRatio="xMidYMid slice" />
                    <title>{`${r.repo.nameWithOwner} · ${r.repo.contributions} contributions`}</title>
                  </a>
                </motion.g>
              </g>
            )
          })}

          <motion.g initial={{ scale: 0 }} animate={{ scale: seen ? 1 : 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} style={{ transformOrigin: `${layout.center.x}px ${layout.center.y}px`, transformBox: 'view-box' }}>
            <circle cx={layout.center.x} cy={layout.center.y} r={34} fill="#6366f1" opacity={0.18} style={{ animation: 'r-glow 3s ease-in-out infinite' }} />
            <circle cx={layout.center.x} cy={layout.center.y} r={29} fill="none" stroke="#818cf8" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 0 8px #818cf8)' }} />
            <image href={avatarUrl} x={layout.center.x - 26} y={layout.center.y - 26} width={52} height={52} clipPath={`url(#${id}-c)`} preserveAspectRatio="xMidYMid slice" />
          </motion.g>
        </svg>

        <AnimatePresence>
          {activeRepo ? (
            <motion.div
              key={activeRepo.repo.nameWithOwner}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute left-2 top-2 max-w-[70%] rounded-lg border px-3 py-2 text-xs shadow-xl backdrop-blur"
              style={{ background: 'var(--r-tooltip-bg)', borderColor: 'var(--r-tooltip-border)', color: 'var(--r-text)' }}
            >
              <div className="truncate font-semibold">{activeRepo.repo.nameWithOwner}</div>
              <div style={{ color: 'var(--r-muted)' }}>
                {activeRepo.repo.external ? 'External project' : 'Own project'} · {activeRepo.repo.contributions} contribution{activeRepo.repo.contributions === 1 ? '' : 's'} · ★ {formatCount(activeRepo.repo.stars)}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="mb-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Top co-contributors</div>
          {collaboration.topCoContributors.length === 0 ? (
            <p className="text-xs text-slate-500">None found.</p>
          ) : (
            <ul className="flex -space-x-2">
              {collaboration.topCoContributors.slice(0, 5).map((c, i) => (
                <motion.li key={c.login} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: seen ? 1 : 0, scale: seen ? 1 : 0.5 }} transition={{ delay: 1.6 + i * 0.08, type: 'spring', stiffness: 300, damping: 18 }} className="transition-transform hover:z-10 hover:-translate-y-1">
                  <a href={`https://github.com/${encodeURIComponent(c.login)}`} target="_blank" rel="noopener noreferrer" title={`${c.login} · ${c.sharedRepos} shared repo${c.sharedRepos === 1 ? '' : 's'}`}>
                    <img src={c.avatarUrl} alt={c.login} width={32} height={32} loading="lazy" className="size-8 rounded-full border-2 border-white bg-slate-200 object-cover dark:border-slate-900 dark:bg-slate-700" />
                  </a>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
        <ul className="flex gap-3 text-[0.7rem] text-slate-500 dark:text-slate-400">
          <li className="flex items-center gap-1.5"><span className={cn('size-2 rounded-full')} style={{ background: OWN }} />Own projects</li>
          <li className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: EXTERNAL }} />External projects</li>
        </ul>
      </div>
    </div>
  )
}
