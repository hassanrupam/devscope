import { useMemo, useState } from 'react'
import { formatCount } from '@/lib/utils'
import { HEALTH_META, type ResourceRow } from '../insights'
import { IsoField, type IsoCell } from './IsoField'
import type { IsoMetrics } from '@/features/report/isoGeometry'

const METRICS: IsoMetrics = { w: 17, h: 9.5, maxH: 118, minH: 8, gap: 0.2 }

/** 3D bar chart: one column per GitHub API resource, height = share of its quota that is used. */
export function QuotaObservatory({ rows }: { rows: ResourceRow[] }) {
  const [active, setActive] = useState<string | null>(null)
  const sorted = useMemo(() => [...rows].sort((a, b) => a.label.localeCompare(b.label)), [rows])
  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)))
  const gridRows = Math.max(1, Math.ceil(sorted.length / cols))

  const cells: IsoCell<ResourceRow>[] = sorted.map((row, i) => {
    const col = i % cols
    const r = Math.floor(i / cols)
    // Linear on purpose: a bar's height is its real percentage of the quota.
    const height = row.health === 'idle' ? 0 : METRICS.minH + ((METRICS.maxH - METRICS.minH) * row.percent) / 100
    return {
      key: row.name,
      col,
      row: r,
      height,
      color: HEALTH_META[row.health].color,
      ghost: row.health !== 'idle',
      glow: row.health === 'critical',
      delay: (col + r) * 70,
      data: row,
    }
  })

  const ranking = [...rows].sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label)).slice(0, 8)

  return (
    <div className="flex h-full flex-col gap-4">
      <IsoField
        cells={cells}
        cols={cols}
        rows={gridRows}
        metrics={METRICS}
        activeKey={active}
        onActiveChange={setActive}
        label={`3D chart of quota usage for ${rows.length} GitHub API resources`}
        className="mx-auto w-full max-w-[560px] flex-1"
        renderTip={({ data }) => (
          <>
            <div className="font-semibold">{data.label}</div>
            <div style={{ color: 'var(--r-muted)' }}>
              {formatCount(data.resource.used)} of {formatCount(data.resource.limit)} · {data.percent < 1 ? data.percent.toFixed(1) : Math.round(data.percent)}% · {HEALTH_META[data.health].label}
            </div>
          </>
        )}
      />

      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs" aria-label="Resources ranked by usage">
        {ranking.map((row) => (
          <li
            key={row.name}
            onPointerEnter={() => setActive(row.name)}
            onPointerLeave={() => setActive(null)}
            className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          >
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: HEALTH_META[row.health].color, boxShadow: `0 0 8px ${HEALTH_META[row.health].color}` }} />
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{row.label}</span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">{row.percent < 1 ? row.percent.toFixed(1) : Math.round(row.percent)}%</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.65rem] text-slate-500">Bar height = percent of quota used · dashed outline = the full limit · red glow = critical.</p>
    </div>
  )
}
