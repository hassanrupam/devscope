import { describe, expect, it } from 'vitest'
import type { ReportNetworkRepo } from '@/services/github/schema'
import { layoutNetwork } from './networkLayout'

const repo = (i: number, contributions: number, contributors = 3): ReportNetworkRepo => ({
  nameWithOwner: `o/r${i}`,
  url: `https://github.com/o/r${i}`,
  ownerLogin: 'o',
  ownerAvatar: 'https://avatars.githubusercontent.com/u/1',
  stars: 1,
  contributions,
  external: i % 2 === 0,
  contributors: Array.from({ length: contributors }, (_, k) => ({ login: `p${k}`, avatarUrl: 'https://avatars.githubusercontent.com/u/2', contributions: 1 })),
})

describe('layoutNetwork', () => {
  const size = { width: 560, height: 380 }
  it('is empty for no repositories', () => expect(layoutNetwork([], size).repos).toEqual([]))

  it('keeps every repository and person inside the canvas', () => {
    const layout = layoutNetwork(Array.from({ length: 7 }, (_, i) => repo(i, 10 ** i)), size)
    for (const r of layout.repos) {
      for (const p of [{ x: r.x, y: r.y, pad: r.r }, ...r.people.map((q) => ({ x: q.x, y: q.y, pad: 10 }))]) {
        expect(p.x - p.pad).toBeGreaterThanOrEqual(0)
        expect(p.x + p.pad).toBeLessThanOrEqual(size.width)
        expect(p.y - p.pad).toBeGreaterThanOrEqual(0)
        expect(p.y + p.pad).toBeLessThanOrEqual(size.height)
      }
    }
  })

  it('makes busier repositories bigger with thicker edges, within sane bounds', () => {
    const [small, big] = layoutNetwork([repo(1, 1), repo(2, 5000)], size).repos
    expect(big!.r).toBeGreaterThan(small!.r)
    expect(big!.strokeWidth).toBeGreaterThan(small!.strokeWidth)
    expect(big!.r).toBeLessThanOrEqual(22)
  })

  it('limits people per repository and places distinct repos at distinct spots', () => {
    const layout = layoutNetwork([repo(1, 5, 5), repo(2, 5, 5), repo(3, 5, 5)], size, 3)
    expect(layout.repos.every((r) => r.people.length === 3)).toBe(true)
    expect(new Set(layout.repos.map((r) => `${r.x.toFixed(1)},${r.y.toFixed(1)}`)).size).toBe(3)
  })
})
