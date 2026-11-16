import type { Day } from './metrics'

/* ------------------------------------------------------------------------------------------------
 * Geometry + colour for the isometric contribution heatmap. Pure functions, no React.
 *
 * Weeks run along the long axis from bottom-left to top-right; weekdays run towards the viewer.
 * ---------------------------------------------------------------------------------------------- */

export interface Cell {
  index: number
  date: string
  count: number
  /** Week column, 0-based, Sunday-first like GitHub's calendar. */
  col: number
  /** Weekday row, 0 = Sunday. */
  row: number
}

export function layoutCells(days: Day[]): { cells: Cell[]; cols: number } {
  if (days.length === 0) return { cells: [], cols: 0 }
  const offset = new Date(`${days[0]?.date}T00:00:00Z`).getUTCDay()
  const cells = days.map((day, i) => ({
    index: i,
    date: day.date,
    count: day.count,
    col: Math.floor((offset + i) / 7),
    row: (offset + i) % 7,
  }))
  const last = cells[cells.length - 1]
  return { cells, cols: (last?.col ?? 0) + 1 }
}

export interface IsoMetrics {
  /** Half the width of a tile. */
  w: number
  /** Half the height of a tile. */
  h: number
  /** Cube height for the busiest day. */
  maxH: number
  /** Cube height for the quietest active day. */
  minH: number
  /** Fraction of the tile left as a gap between cubes. */
  gap: number
}

export const DEFAULT_METRICS: IsoMetrics = { w: 10, h: 7.2, maxH: 96, minH: 4, gap: 0.14 }

/** Canvas size (in SVG units) that fits the whole grid plus the tallest cube and a small margin. */
export function sceneSize(cols: number, m: IsoMetrics = DEFAULT_METRICS, margin = 14) {
  return {
    width: (cols + 7) * m.w + margin * 2,
    height: (cols + 7) * m.h + m.maxH + margin * 2,
  }
}

/** Centre of a tile's footprint. */
export function project(col: number, row: number, cols: number, m: IsoMetrics = DEFAULT_METRICS, margin = 14) {
  const v = cols - 1 - col
  return {
    x: margin + (row - v + (cols - 1)) * m.w + m.w,
    y: margin + m.maxH + (row + v) * m.h + m.h,
  }
}

/** sqrt keeps one huge day from flattening everything else. 0 -> 0, max -> 1. */
export function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return Math.sqrt(Math.min(1, count / max))
}

export function cubeHeight(count: number, max: number, m: IsoMetrics = DEFAULT_METRICS): number {
  const t = intensity(count, max)
  return t === 0 ? 0 : m.minH + (m.maxH - m.minH) * t
}

/** Back-to-front draw order so nearer cubes cover farther ones. */
export function drawOrder(cells: Cell[]): Cell[] {
  return [...cells].sort((a, b) => a.row - a.col - (b.row - b.col) || a.col - b.col)
}

const f = (n: number) => Math.round(n * 100) / 100

/** SVG path data for the three visible faces of a cube standing on tile (cx, cy). */
export function cubePaths(cx: number, cy: number, height: number, m: IsoMetrics = DEFAULT_METRICS) {
  const w = m.w * (1 - m.gap)
  const h = m.h * (1 - m.gap)
  const top = `M${f(cx)} ${f(cy - h - height)}L${f(cx + w)} ${f(cy - height)}L${f(cx)} ${f(cy + h - height)}L${f(cx - w)} ${f(cy - height)}Z`
  const left = `M${f(cx - w)} ${f(cy - height)}L${f(cx)} ${f(cy + h - height)}L${f(cx)} ${f(cy + h)}L${f(cx - w)} ${f(cy)}Z`
  const right = `M${f(cx + w)} ${f(cy - height)}L${f(cx)} ${f(cy + h - height)}L${f(cx)} ${f(cy + h)}L${f(cx + w)} ${f(cy)}Z`
  return { top, left, right }
}

/* ---------- Colour ---------- */

const STOPS: Array<[number, [number, number, number]]> = [
  [0, [59, 130, 246]], // blue
  [0.22, [34, 211, 238]], // cyan
  [0.45, [52, 211, 153]], // green
  [0.65, [163, 230, 53]], // lime
  [0.82, [251, 191, 36]], // amber
  [1, [239, 68, 68]], // red
]

/** Colour for an active day, t in 0..1 (see `intensity`). */
export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i] as (typeof STOPS)[number]
    const [t0, c0] = STOPS[i - 1] as (typeof STOPS)[number]
    if (x <= t1) {
      const k = t1 === t0 ? 0 : (x - t0) / (t1 - t0)
      const mix = (a: number, b: number) => Math.round(a + (b - a) * k)
      return `rgb(${mix(c0[0], c1[0])} ${mix(c0[1], c1[1])} ${mix(c0[2], c1[2])})`
    }
  }
  const last = STOPS[STOPS.length - 1]?.[1] ?? [239, 68, 68]
  return `rgb(${last[0]} ${last[1]} ${last[2]})`
}

/** CSS gradient string that matches `heatColor`, for legends. */
export const HEAT_GRADIENT = `linear-gradient(90deg, ${STOPS.map(([t, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${Math.round(t * 100)}%`).join(', ')})`
