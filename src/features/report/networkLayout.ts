import type { ReportNetworkRepo } from '@/services/github/schema'

/* Radial layout for the collaboration network: the developer in the middle, repositories on an
 * ellipse around them, and each repository's co-contributors fanned out just beyond it. Pure. */

export interface NetPerson {
  login: string
  avatarUrl: string
  x: number
  y: number
}

export interface NetRepo {
  repo: ReportNetworkRepo
  x: number
  y: number
  /** Node radius, grows (logarithmically) with the developer's contributions to it. */
  r: number
  /** Edge thickness from the centre. */
  strokeWidth: number
  people: NetPerson[]
}

export interface NetworkLayout {
  center: { x: number; y: number }
  repos: NetRepo[]
}

const log = (value: number, max: number) => Math.min(1, Math.log10(1 + Math.max(0, value)) / Math.log10(1 + max))

export function layoutNetwork(
  repos: ReportNetworkRepo[],
  { width, height }: { width: number; height: number },
  peoplePerRepo = 3,
): NetworkLayout {
  const center = { x: width / 2, y: height / 2 }
  const rx = width * 0.27
  const ry = height * 0.25
  const n = repos.length

  return {
    center,
    repos: repos.map((repo, i) => {
      // Start at the top-left so the first (most important) repo reads first; spread evenly.
      const angle = -Math.PI / 2 - Math.PI / 4 + (i / Math.max(1, n)) * Math.PI * 2
      const weight = log(repo.contributions, 1000)
      const x = center.x + Math.cos(angle) * rx
      const y = center.y + Math.sin(angle) * ry

      const people = repo.contributors.slice(0, peoplePerRepo).map((person, k, all) => {
        const spread = (k - (all.length - 1) / 2) * 0.3
        return {
          login: person.login,
          avatarUrl: person.avatarUrl,
          x: center.x + Math.cos(angle + spread) * rx * 1.62,
          y: center.y + Math.sin(angle + spread) * ry * 1.62,
        }
      })

      return { repo, x, y, r: 12 + weight * 10, strokeWidth: 1 + weight * 3.2, people }
    }),
  }
}
