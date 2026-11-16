import { describe, expect, it } from 'vitest'
import { calendarDays } from './metrics'
import { cubeHeight, cubePaths, DEFAULT_METRICS, drawOrder, heatColor, intensity, layoutCells, project, sceneSize } from './isoGeometry'

describe('layoutCells', () => {
  it('places days in Sunday-first week columns', () => {
    // 2026-11-15 is a Sunday, 2026-11-14 a Saturday.
    const { cells, cols } = layoutCells(calendarDays({ start: '2026-11-14', counts: [1, 2, 3, 4, 5, 6, 7, 8, 9] }))
    expect(cells[0]).toMatchObject({ date: '2026-11-14', col: 0, row: 6 })
    expect(cells[1]).toMatchObject({ date: '2026-11-15', col: 1, row: 0 })
    expect(cells[8]).toMatchObject({ date: '2026-11-22', col: 2, row: 0 })
    expect(cols).toBe(3)
  })
  it('handles no days', () => expect(layoutCells([])).toEqual({ cells: [], cols: 0 }))
})

describe('projection', () => {
  const cols = 53
  it('runs weeks up and to the right, weekdays down and to the right', () => {
    const a = project(0, 0, cols)
    const nextWeek = project(1, 0, cols)
    const nextDay = project(0, 1, cols)
    expect(nextWeek.x).toBeGreaterThan(a.x)
    expect(nextWeek.y).toBeLessThan(a.y)
    expect(nextDay.x).toBeGreaterThan(a.x)
    expect(nextDay.y).toBeGreaterThan(a.y)
  })
  it('keeps every tile and the tallest cube inside the scene', () => {
    const { width, height } = sceneSize(cols)
    for (const [c, r] of [[0, 0], [0, 6], [52, 0], [52, 6]] as const) {
      const { x, y } = project(c, r, cols)
      expect(x - DEFAULT_METRICS.w).toBeGreaterThanOrEqual(0)
      expect(x + DEFAULT_METRICS.w).toBeLessThanOrEqual(width)
      expect(y - DEFAULT_METRICS.maxH - DEFAULT_METRICS.h).toBeGreaterThanOrEqual(0)
      expect(y + DEFAULT_METRICS.h).toBeLessThanOrEqual(height)
    }
  })
  it('draws far cells before near ones', () => {
    const order = drawOrder(layoutCells(calendarDays({ start: '2026-11-15', counts: Array(14).fill(1) })).cells)
    const depth = order.map((c) => c.row - c.col)
    expect(depth).toEqual([...depth].sort((a, b) => a - b))
  })
})

describe('height and colour', () => {
  it('has no height for quiet days and scales active ones up to the max', () => {
    expect(cubeHeight(0, 10)).toBe(0)
    expect(cubeHeight(10, 10)).toBe(DEFAULT_METRICS.maxH)
    expect(cubeHeight(1, 100)).toBeGreaterThan(DEFAULT_METRICS.minH)
    expect(cubeHeight(1, 100)).toBeLessThan(cubeHeight(50, 100))
  })
  it('uses a sqrt intensity scale clamped to 0..1', () => {
    expect(intensity(25, 100)).toBeCloseTo(0.5)
    expect(intensity(500, 100)).toBe(1)
    expect(intensity(0, 0)).toBe(0)
  })
  it('goes from blue to red and clamps', () => {
    expect(heatColor(0)).toBe('rgb(59 130 246)')
    expect(heatColor(1)).toBe('rgb(239 68 68)')
    expect(heatColor(-3)).toBe(heatColor(0))
    expect(heatColor(9)).toBe(heatColor(1))
  })
  it('builds closed polygons for each face', () => {
    const { top, left, right } = cubePaths(100, 100, 20)
    for (const p of [top, left, right]) expect(p).toMatch(/^M[\d. -]+(L[\d. -]+){3}Z$/)
  })
})
