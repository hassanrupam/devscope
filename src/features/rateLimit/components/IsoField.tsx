import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { cubePaths, project, sceneSize, type IsoMetrics } from '@/features/report/isoGeometry'

/** One column/tile in an isometric scene. */
export interface IsoCell<T = unknown> {
  key: string
  col: number
  row: number
  /** Cube height in scene units; 0 draws a flat floor tile. */
  height: number
  color: string
  /** Draws a faint full-height outline behind the cube (shows the "limit" the bar is measured against). */
  ghost?: boolean
  glow?: boolean
  delay?: number
  data: T
}

interface IsoFieldProps<T> {
  cells: IsoCell<T>[]
  cols: number
  rows: number
  metrics: IsoMetrics
  label: string
  renderTip: (cell: IsoCell<T>) => ReactNode
  /** Cell to emphasise from outside (e.g. a hovered legend row); others dim. */
  activeKey?: string | null
  onActiveChange?: (key: string | null) => void
  loading?: boolean
  className?: string
}

const shade = (color: string, amount: number) => `color-mix(in srgb, ${color}, black ${amount}%)`

/**
 * Generic isometric 3D scene (the same projection as the contribution heatmap). Draws cells back to
 * front, animates them rising on mount, and shows a theme-aware tooltip on hover/focus.
 */
export function IsoField<T>({ cells, cols, rows, metrics, label, renderTip, activeKey, onActiveChange, loading, className }: IsoFieldProps<T>) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ cell: IsoCell<T>; left: number; top: number } | null>(null)
  const scene = sceneSize(cols, metrics, 14, rows)
  const ordered = useMemo(() => [...cells].sort((a, b) => a.row - a.col - (b.row - b.col) || a.col - b.col), [cells])

  function show(cell: IsoCell<T>, target: Element) {
    const box = wrapper.current?.getBoundingClientRect()
    if (!box) return
    const rect = target.getBoundingClientRect()
    setHover({ cell, left: rect.left - box.left + rect.width / 2, top: rect.top - box.top })
    onActiveChange?.(cell.key)
  }
  const hide = () => {
    setHover(null)
    onActiveChange?.(null)
  }
  const focusKey = hover?.cell.key ?? activeKey ?? null

  return (
    <div ref={wrapper} className={cn('relative', className)} onPointerLeave={hide}>
      <svg viewBox={`0 0 ${scene.width} ${scene.height}`} className="h-auto w-full overflow-visible" role="img" aria-label={label}>
        {ordered.map((cell) => {
          const { x, y } = project(cell.col, cell.row, cols, metrics)
          const paths = cubePaths(x, y, cell.height, metrics)
          const dim = focusKey !== null && focusKey !== cell.key
          const solid = cell.height > 0
          return (
            <g
              key={cell.key}
              className={cn('r-cube-col', loading && 'r-tile')}
              style={{
                animationDelay: `${cell.delay ?? 0}ms`,
                opacity: dim ? 0.38 : 1,
                transition: 'opacity 0.2s',
                filter: cell.glow && !dim ? `drop-shadow(0 0 7px ${cell.color})` : undefined,
              }}
              onPointerEnter={(e) => !loading && show(cell, e.currentTarget)}
              onPointerLeave={hide}
            >
              {solid ? (
                <>
                  <path d={paths.left} fill={shade(cell.color, 32)} />
                  <path d={paths.right} fill={shade(cell.color, 52)} />
                </>
              ) : null}
              <path d={paths.top} fill={cell.color} opacity={solid ? 1 : 0.8} />
              {cell.ghost ? <path d={cubePaths(x, y, metrics.maxH, metrics).top} fill="none" strokeDasharray="2 3" strokeWidth={0.8} style={{ stroke: 'var(--r-muted)' }} opacity={0.5} /> : null}
            </g>
          )
        })}
      </svg>

      <AnimatePresence>
        {hover ? (
          <motion.div
            key="tip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs shadow-xl backdrop-blur"
            style={{ left: hover.left, top: hover.top - 6, background: 'var(--r-tooltip-bg)', borderColor: 'var(--r-tooltip-border)', color: 'var(--r-text)' }}
          >
            {renderTip(hover.cell)}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
