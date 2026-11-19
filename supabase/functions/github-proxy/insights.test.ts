import { describe, expect, it } from 'vitest'
import {
  buildInsights,
  cadenceDays,
  compareSemver,
  InsightsError,
  packageStatus,
  parseCargoToml,
  parseGoMod,
  parsePackageJson,
  parseRequirements,
  parseSemver,
  releaseKind,
  withGaps,
} from './insights'

const NOW = new Date('2026-11-18T12:00:00Z')

describe('semver helpers', () => {
  it('parses lenient versions', () => {
    expect(parseSemver('v6.13-rc3')).toEqual({ major: 6, minor: 13, patch: 0, pre: 'rc3' })
    expect(parseSemver('1.4.0')).toEqual({ major: 1, minor: 4, patch: 0, pre: null })
    expect(parseSemver('latest')).toBeNull()
  })
  it('orders pre-releases below the final release', () => {
    const rc = parseSemver('2.0.0-rc1')!
    const final = parseSemver('2.0.0')!
    expect(compareSemver(rc, final)).toBeLessThan(0)
  })
  it('classifies release kinds', () => {
    expect(releaseKind('v2.0.0', false)).toBe('major')
    expect(releaseKind('v2.3.0', false)).toBe('minor')
    expect(releaseKind('v2.3.4', false)).toBe('patch')
    expect(releaseKind('v2.3.4', true)).toBe('pre')
    expect(releaseKind('v6.13-rc3', false)).toBe('pre')
  })
  it('flags outdated and advisory packages', () => {
    expect(packageStatus('1.2.0', '1.3.0', false)).toBe('outdated')
    expect(packageStatus('1.3.0', '1.3.0', false)).toBe('current')
    expect(packageStatus('1.0.0', '9.0.0', true)).toBe('advisory')
    expect(packageStatus('1.0.0', null, false)).toBe('current')
  })
})

describe('release gaps and cadence', () => {
  const base = { repo: 'a/b', kind: 'minor' as const, prerelease: false, notes: '', url: 'u', source: 'release' as const }
  it('computes days since the previous release, newest first', () => {
    const items = withGaps([
      { ...base, tag: 'v1', publishedAt: '2026-10-01T00:00:00Z' },
      { ...base, tag: 'v3', publishedAt: '2026-11-01T00:00:00Z' },
      { ...base, tag: 'v2', publishedAt: '2026-10-15T00:00:00Z' },
    ])
    expect(items.map((i) => [i.tag, i.sincePrevDays, i.sincePrevTag])).toEqual([
      ['v3', 17, 'v2'],
      ['v2', 14, 'v1'],
      ['v1', null, null],
    ])
    expect(cadenceDays(items)).toBe(16)
  })
  it('has no cadence without gaps', () => expect(cadenceDays([])).toBeNull())
})

describe('manifest parsers', () => {
  it('reads package.json ranges and skips local specs', () => {
    const deps = parsePackageJson(JSON.stringify({ dependencies: { react: '^19.1.0', local: 'file:../x' }, devDependencies: { vite: '~7.0' } }))
    expect(deps).toEqual([
      { name: 'react', version: '19.1.0', ecosystem: 'npm' },
      { name: 'vite', version: '7.0', ecosystem: 'npm' },
    ])
    expect(parsePackageJson('not json')).toEqual([])
  })
  it('reads requirements.txt', () => {
    expect(parseRequirements('# c\nrequests==2.31.0\nflask[async]>=2.0\nnumpy\n')).toEqual([
      { name: 'requests', version: '2.31.0', ecosystem: 'pip' },
      { name: 'flask', version: '2.0', ecosystem: 'pip' },
    ])
  })
  it('reads Cargo.toml dependency tables', () => {
    const toml = `[package]\nname = "x"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0.200"\ntokio = { version = "1.38", features = ["full"] }\n\n[features]\ndefault = "1"`
    expect(parseCargoToml(toml).map((d) => [d.name, d.version])).toEqual([['serde', '1.0.200'], ['tokio', '1.38']])
  })
  it('reads go.mod require blocks', () => {
    const mod = `module x\n\nrequire (\n\tgithub.com/a/b v1.2.3 // indirect\n\tgolang.org/x/net v0.20.0\n)\nrequire github.com/c/d v2.0.0+incompatible`
    expect(parseGoMod(mod).map((d) => [d.name, d.version])).toEqual([
      ['github.com/a/b', '1.2.3'],
      ['golang.org/x/net', '0.20.0'],
      ['github.com/c/d', '2.0.0+incompatible'],
    ])
  })
})

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init })

function fakeFetch(extra: Record<string, () => Response> = {}) {
  const calls: string[] = []
  const routes: Record<string, () => Response> = {
    '/users/octocat/repos': () =>
      json([
        { name: 'app', full_name: 'octocat/app', fork: false, archived: false, html_url: 'https://github.com/octocat/app' },
        { name: 'kernel', full_name: 'octocat/kernel', fork: false, archived: false, html_url: 'https://github.com/octocat/kernel' },
        { name: 'forked', full_name: 'octocat/forked', fork: true, archived: false, html_url: 'x' },
      ]),
    '/repos/octocat/app/releases': () =>
      json([
        { tag_name: 'v1.4.0', name: 'v1.4.0', body: '## Added\n**Biquad** filter [docs](http://x)', prerelease: false, draft: false, published_at: '2026-11-10T00:00:00Z', html_url: 'https://github.com/octocat/app/releases/tag/v1.4.0' },
        { tag_name: 'v1.3.2', name: null, body: 'Fixes', prerelease: false, draft: false, published_at: '2026-10-22T00:00:00Z', html_url: 'u2' },
        { tag_name: 'v1.5.0-draft', name: null, body: '', prerelease: false, draft: true, published_at: null, html_url: 'u3' },
      ]),
    '/repos/octocat/kernel/releases': () => json([]),
    '/repos/octocat/kernel/tags': () => json([{ name: 'v6.13-rc3', commit: { sha: 'abc' } }]),
    '/repos/octocat/kernel/commits/abc': () => json({ commit: { message: "Merge tag 'vfs-6.13-rc3'\n\nbody", committer: { date: '2026-11-16T00:00:00Z' }, author: null } }),
    '/repos/octocat/app/contents': () => json([{ name: 'package.json', type: 'file' }, { name: 'Makefile', type: 'file' }, { name: 'src', type: 'dir' }]),
    '/repos/octocat/kernel/contents': () => json([]),
    '/repos/octocat/app/contents/package.json': () => new Response(JSON.stringify({ dependencies: { react: '^18.0.0', lodash: '^4.17.15' } })),
    '/advisories': () => json([]),
    ...extra,
  }
  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(url.host + url.pathname)
    if (url.host === 'registry.npmjs.org') return json({ version: url.pathname.includes('react') ? '19.2.0' : '4.17.15' })
    const handler = routes[url.pathname]
    return handler ? handler() : new Response('{}', { status: 404 })
  }) as typeof fetch
  return { impl, calls }
}

describe('buildInsights', () => {
  it('builds a release timeline (releases + tag fallback) and a stack radar', async () => {
    const { impl } = fakeFetch({
      '/advisories': () => json([{ ghsa_id: 'GHSA-1', summary: 'Prototype pollution', severity: 'high', html_url: 'https://github.com/advisories/GHSA-1' }]),
    })
    const result = await buildInsights('octocat', { token: 't', fetchImpl: impl, now: () => NOW })

    expect(result.login).toBe('octocat')
    expect(result.releases.items.map((r) => r.tag)).toEqual(['v6.13-rc3', 'v1.4.0', 'v1.3.2'])
    const [rc, major, patch] = result.releases.items
    expect(rc).toMatchObject({ kind: 'pre', prerelease: true, source: 'tag', notes: "Merge tag 'vfs-6.13-rc3'" })
    expect(major).toMatchObject({ kind: 'minor', sincePrevDays: 19, sincePrevTag: 'v1.3.2', notes: 'Added Biquad filter docs' })
    expect(patch?.sincePrevDays).toBeNull()
    expect(result.releases.cadenceDays).toBe(19)

    expect(result.stack.manifests).toEqual([
      { repo: 'app', file: 'package.json', label: 'Node / npm' },
      { repo: 'app', file: 'Makefile', label: 'Make build' },
    ])
    expect(result.stack.packages.map((p) => [p.name, p.installed, p.latest])).toEqual([
      ['react', '18.0.0', '19.2.0'],
      ['lodash', '4.17.15', '4.17.15'],
    ])
    // Every package carries the advisory returned by the fake API.
    expect(result.stack.packages.every((p) => p.status === 'advisory' && p.advisory?.id === 'GHSA-1')).toBe(true)
  })

  it('marks outdated vs current when there are no advisories, and never calls GraphQL', async () => {
    const { impl, calls } = fakeFetch()
    const result = await buildInsights('octocat', { token: 't', fetchImpl: impl, now: () => NOW })
    expect(result.stack.packages.map((p) => p.status)).toEqual(['outdated', 'current'])
    expect(calls.some((c) => c.includes('graphql'))).toBe(false)
  })

  it('survives failures of individual lookups', async () => {
    const { impl } = fakeFetch({ '/repos/octocat/app/contents': () => new Response('{}', { status: 500 }), '/advisories': () => new Response('{}', { status: 500 }) })
    const result = await buildInsights('octocat', { token: 't', fetchImpl: impl, now: () => NOW })
    expect(result.stack.packages).toEqual([])
    expect(result.releases.items.length).toBeGreaterThan(0)
  })

  it('maps a missing user and rate limiting to errors', async () => {
    await expect(buildInsights('ghost', { token: 't', fetchImpl: (async () => new Response('{}', { status: 404 })) as typeof fetch })).rejects.toMatchObject({ status: 404 })
    const limited = (async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })) as typeof fetch
    await expect(buildInsights('octocat', { token: 't', fetchImpl: limited })).rejects.toBeInstanceOf(InsightsError)
  })
})
