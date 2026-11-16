import { motion } from 'framer-motion'
import { useId, useMemo } from 'react'
import { useInViewOnce } from '../hooks'
import type { TreeLanguage } from '../metrics'

const COLORS = ['#f87171', '#a78bfa', '#38bdf8']
const W = 560
const ROW = 25

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2
  return `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

interface Props {
  login: string
  avatarUrl: string
  tree: TreeLanguage[]
}

export function LanguageTree({ login, avatarUrl, tree }: Props) {
  const id = useId().replace(/:/g, '')
  const [ref, seen] = useInViewOnce<HTMLDivElement>()

  const layout = useMemo(() => {
    let top = 14
    const langs = tree.map((lang) => {
      const height = Math.max(1, lang.repos.length) * ROW
      const entry = { lang, y: top + height / 2, leaves: lang.repos.map((repo, i) => ({ repo, y: top + i * ROW + ROW / 2 })) }
      top += height + 12
      return entry
    })
    const height = Math.max(190, top + 34)
    return { langs, height }
  }, [tree])

  if (tree.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No language data on this user&apos;s own repositories yet.</p>
  }

  const rootX = 46
  const rootY = layout.height / 2
  const langX = 214
  const leafX = 378

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${layout.height}`} className="h-auto w-full" role="img" aria-label={`Language ecosystem of ${login}: ${tree.map((t) => t.language).join(', ')}`}>
        <defs>
          <clipPath id={`${id}-root`}><circle cx={rootX} cy={rootY} r={22} /></clipPath>
        </defs>

        {layout.langs.map(({ lang, y, leaves }, i) => {
          const color = COLORS[i % COLORS.length] as string
          return (
            <g key={lang.language}>
              <motion.path d={curve(rootX + 22, rootY, langX - 12, y)} fill="none" stroke={color} strokeOpacity={0.75} strokeWidth={2} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 0.9, delay: 0.2 + i * 0.15, ease: 'easeOut' }} />
              {leaves.map(({ repo, y: ly }, k) => (
                <g key={repo.name}>
                  <motion.path d={curve(langX + 12, y, leafX - 6, ly)} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 0.8, delay: 0.9 + i * 0.15 + k * 0.07, ease: 'easeOut' }} />
                  <motion.g initial={{ opacity: 0, x: -6 }} animate={{ opacity: seen ? 1 : 0, x: seen ? 0 : -6 }} transition={{ delay: 1.3 + i * 0.15 + k * 0.07, duration: 0.4 }}>
                    <a href={repo.url} target="_blank" rel="noopener noreferrer">
                      <circle cx={leafX} cy={ly} r={4.5} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                      <text x={leafX + 11} y={ly + 4} fontSize="11.5" style={{ fill: 'var(--r-text)' }}>{clip(repo.name, 22)}</text>
                      {repo.stars > 0 ? <text x={W - 4} y={ly + 4} fontSize="10" textAnchor="end" style={{ fill: 'var(--r-muted)' }}>★ {repo.stars.toLocaleString('en')}</text> : null}
                      <title>{`${repo.name} · ★ ${repo.stars}`}</title>
                    </a>
                  </motion.g>
                </g>
              ))}
              <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: seen ? 1 : 0, opacity: seen ? 1 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.7 + i * 0.15 }} style={{ transformOrigin: `${langX}px ${y}px`, transformBox: 'view-box' }}>
                <circle cx={langX} cy={y} r={13} fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
                <circle cx={langX} cy={y} r={5} fill="white" opacity={0.85} />
                <text x={langX} y={y + 28} fontSize="11" fontWeight="600" textAnchor="middle" style={{ fill: 'var(--r-text)' }}>{lang.language}</text>
                <text x={langX} y={y + 40} fontSize="9" textAnchor="middle" style={{ fill: 'var(--r-muted)' }}>{lang.repoCount} repo{lang.repoCount === 1 ? '' : 's'}</text>
              </motion.g>
            </g>
          )
        })}

        <motion.g initial={{ scale: 0 }} animate={{ scale: seen ? 1 : 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} style={{ transformOrigin: `${rootX}px ${rootY}px`, transformBox: 'view-box' }}>
          <circle cx={rootX} cy={rootY} r={27} fill="none" stroke="#34d399" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 0 8px #34d399)' }} />
          <image href={avatarUrl} x={rootX - 22} y={rootY - 22} width={44} height={44} clipPath={`url(#${id}-root)`} preserveAspectRatio="xMidYMid slice" />
        </motion.g>
      </svg>
    </div>
  )
}
