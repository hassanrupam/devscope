import { describe, expect, it, vi } from 'vitest'
import type { ProjectInsights } from '@/services/github/schema'
import { createInsightsService } from './insightsService'

const insights: ProjectInsights = {
  login: 'octocat',
  generatedAt: '2026-11-18T00:00:00Z',
  releases: { cadenceDays: null, items: [] },
  stack: { manifests: [], packages: [] },
}
const NOW = new Date('2026-11-18T12:00:00Z')

function setup(cachedAt: Date | null) {
  const cache = {
    get: vi.fn(async () => (cachedAt ? { data: insights, fetchedAt: cachedAt } : null)),
    acquireLock: vi.fn(async () => true),
    releaseLock: vi.fn(async () => undefined),
    save: vi.fn(async () => NOW),
  }
  const github = { fetchInsights: vi.fn(async () => insights) }
  const service = createInsightsService({ cache, github, ttlMs: 24 * 3600_000, now: () => NOW, sleep: async () => undefined })
  return { service, cache, github }
}

describe('insightsService', () => {
  it('serves a fresh shared copy without calling the proxy', async () => {
    const { service, github } = setup(new Date(NOW.getTime() - 3600_000))
    expect((await service.getInsights('OctoCat')).source).toBe('cache')
    expect(github.fetchInsights).not.toHaveBeenCalled()
  })
  it('builds and saves on a miss', async () => {
    const { service, github, cache } = setup(null)
    await service.getInsights('octocat')
    expect(github.fetchInsights).toHaveBeenCalledWith('octocat')
    expect(cache.save).toHaveBeenCalledWith('octocat', insights)
  })
})
