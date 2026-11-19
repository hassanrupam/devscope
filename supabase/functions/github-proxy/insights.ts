/**
 * Builds the "project insights" for one user: a release timeline and a tech-stack / security radar.
 *
 * Only free, read-only REST endpoints are used:
 *   GitHub  /users/{u}/repos, /repos/{o}/{r}/releases, /tags, /commits/{sha}, /contents, /advisories
 *   Registries (latest version lookup): npm, PyPI, crates.io, proxy.golang.org
 * No GraphQL. The result is small and is stored in the shared Supabase cache by the browser, so
 * GitHub and the registries are hit once per user per cache window.
 *
 * Plain Web-standard TypeScript (no Deno APIs) so it can be unit-tested with Vitest.
 */

const GITHUB_API = 'https://api.github.com'
const MAX_REPOS = 8
const MAX_RELEASE_REPOS = 6
const RELEASES_PER_REPO = 3
const MAX_TAG_FALLBACK_REPOS = 2
const MAX_RELEASES = 9
const MAX_STACK_REPOS = 4
const MAX_PACKAGES = 36
const NOTES_MAX = 240
const CONCURRENCY = 6
const DAY_MS = 24 * 60 * 60 * 1000

export type Ecosystem = 'npm' | 'pip' | 'rust' | 'go'
export type ReleaseKind = 'major' | 'minor' | 'patch' | 'pre'
export type PackageStatus = 'current' | 'outdated' | 'advisory'

export interface ReleaseItem {
  repo: string
  tag: string
  kind: ReleaseKind
  prerelease: boolean
  publishedAt: string
  /** Days since the previous release of the same repository, if known. */
  sincePrevDays: number | null
  sincePrevTag: string | null
  notes: string
  url: string
  source: 'release' | 'tag'
}

export interface StackPackage {
  name: string
  repo: string
  ecosystem: Ecosystem
  /** Lowest version the manifest allows (ranges like ^1.2.3 become 1.2.3). */
  installed: string
  latest: string | null
  status: PackageStatus
  advisory: { id: string; summary: string; severity: string; url: string } | null
}

export interface ProjectInsights {
  login: string
  generatedAt: string
  releases: { cadenceDays: number | null; items: ReleaseItem[] }
  stack: {
    manifests: Array<{ repo: string; file: string; label: string }>
    packages: StackPackage[]
  }
}

export class InsightsError extends Error {
  readonly status: number
  readonly headers: Record<string, string>
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message)
    this.name = 'InsightsError'
    this.status = status
    this.headers = headers
  }
}

export interface InsightsDeps {
  token: string
  fetchImpl: typeof fetch
  now?: () => Date
}

/* ---------- Pure helpers ---------- */

export interface Semver {
  major: number
  minor: number
  patch: number
  pre: string | null
}

/** Lenient semver: `v1.2`, `1.2.3-rc1`, `6.13-rc3`. Returns null when no numeric version is found. */
export function parseSemver(input: string): Semver | null {
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-.]?((?:rc|alpha|beta|pre|dev|preview|canary|next)[\w.-]*))?/i.exec(input)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2] ?? 0), patch: Number(m[3] ?? 0), pre: m[4] ?? null }
}

export function compareSemver(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || (a.pre ? 0 : 1) - (b.pre ? 0 : 1)
}

export function releaseKind(tag: string, prerelease: boolean): ReleaseKind {
  const v = parseSemver(tag)
  if (prerelease || v?.pre) return 'pre'
  if (!v) return 'patch'
  if (v.minor === 0 && v.patch === 0) return 'major'
  if (v.patch === 0) return 'minor'
  return 'patch'
}

const clean = (text: string) =>
  text
    .replace(/\r/g, '')
    .replace(/[#*`>_~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTES_MAX)

/** Median gap in days between consecutive releases (all repositories pooled). */
export function cadenceDays(items: ReleaseItem[]): number | null {
  const gaps = items.flatMap((i) => (i.sincePrevDays !== null && i.sincePrevDays > 0 ? [i.sincePrevDays] : []))
  if (gaps.length === 0) return null
  const sorted = [...gaps].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? (sorted[mid] as number) : Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2)
}

/** Fills `sincePrev*` for a repository's releases (newest first). */
export function withGaps(items: Array<Omit<ReleaseItem, 'sincePrevDays' | 'sincePrevTag'>>): ReleaseItem[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  return sorted.map((item, i) => {
    const prev = sorted[i + 1]
    return {
      ...item,
      sincePrevDays: prev ? Math.max(0, Math.round((Date.parse(item.publishedAt) - Date.parse(prev.publishedAt)) / DAY_MS)) : null,
      sincePrevTag: prev?.tag ?? null,
    }
  })
}

interface RawDep {
  name: string
  version: string
  ecosystem: Ecosystem
}

const lowestVersion = (range: string): string | null => {
  const m = /(\d+(?:\.\d+){0,2})/.exec(range)
  return m ? (m[1] as string) : null
}

export function parsePackageJson(text: string): RawDep[] {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return []
  }
  if (typeof json !== 'object' || json === null) return []
  const out: RawDep[] = []
  for (const key of ['dependencies', 'devDependencies']) {
    const section = (json as Record<string, unknown>)[key]
    if (typeof section !== 'object' || section === null) continue
    for (const [name, range] of Object.entries(section)) {
      const version = typeof range === 'string' ? lowestVersion(range) : null
      if (version && !/^(?:file|link|git|http|workspace):/.test(range as string)) out.push({ name, version, ecosystem: 'npm' })
    }
  }
  return out
}

export function parseRequirements(text: string): RawDep[] {
  const out: RawDep[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?:==|>=|~=|<=|>|<|===)\s*([0-9][\w.]*)/.exec(line)
    if (m) out.push({ name: m[1] as string, version: m[2] as string, ecosystem: 'pip' })
  }
  return out
}

export function parseCargoToml(text: string): RawDep[] {
  const out: RawDep[] = []
  let inDeps = false
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inDeps = /^\[(?:dev-|build-)?dependencies\]$/.test(line)
      continue
    }
    if (!inDeps) continue
    const simple = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/.exec(line)
    const table = /^([A-Za-z0-9_-]+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/.exec(line)
    const m = simple ?? table
    const version = m ? lowestVersion(m[2] as string) : null
    if (m && version) out.push({ name: m[1] as string, version, ecosystem: 'rust' })
  }
  return out
}

export function parseGoMod(text: string): RawDep[] {
  const out: RawDep[] = []
  let block = false
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (line === 'require (') {
      block = true
      continue
    }
    if (block && line === ')') {
      block = false
      continue
    }
    const m = block ? /^(\S+)\s+v(\d[\w.+-]*)/.exec(line) : /^require\s+(\S+)\s+v(\d[\w.+-]*)/.exec(line)
    if (m) out.push({ name: m[1] as string, version: m[2] as string, ecosystem: 'go' })
  }
  return out
}

const MANIFESTS: Record<string, { label: string; parse?: (text: string) => RawDep[] }> = {
  'package.json': { label: 'Node / npm', parse: parsePackageJson },
  'requirements.txt': { label: 'Python / pip', parse: parseRequirements },
  'Cargo.toml': { label: 'Rust / Cargo', parse: parseCargoToml },
  'go.mod': { label: 'Go modules', parse: parseGoMod },
  'pyproject.toml': { label: 'Python project' },
  Gemfile: { label: 'Ruby / Bundler' },
  'pom.xml': { label: 'Java / Maven' },
  'build.gradle': { label: 'Gradle' },
  Dockerfile: { label: 'Container' },
  Makefile: { label: 'Make build' },
  'CMakeLists.txt': { label: 'CMake' },
  Kconfig: { label: 'Kernel build' },
}

export function packageStatus(installed: string, latest: string | null, hasAdvisory: boolean): PackageStatus {
  if (hasAdvisory) return 'advisory'
  const a = parseSemver(installed)
  const b = latest ? parseSemver(latest) : null
  return a && b && compareSemver(a, b) < 0 ? 'outdated' : 'current'
}

/* ---------- Network ---------- */

class Budget {
  constructor(public rateLimited = false) {}
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i] as T)
      }
    }),
  )
  return out
}

function makeGithub({ token, fetchImpl }: InsightsDeps, budget: Budget) {
  const headers = (accept = 'application/vnd.github+json') => ({
    accept,
    authorization: `Bearer ${token}`,
    'user-agent': 'devexplore-insights',
    'x-github-api-version': '2022-11-28',
  })

  /** null for 404 / 403-on-resource / other soft failures; throws only when GitHub itself is rate limited. */
  async function get(path: string, accept?: string): Promise<Response | null> {
    if (budget.rateLimited) return null
    let response: Response
    try {
      response = await fetchImpl(`${GITHUB_API}${path}`, { headers: headers(accept) })
    } catch {
      return null
    }
    if (response.ok) return response
    if ((response.status === 403 || response.status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
      budget.rateLimited = true
    }
    return null
  }

  async function json<T>(path: string): Promise<T | null> {
    const response = await get(path)
    if (!response) return null
    try {
      return (await response.json()) as T
    } catch {
      return null
    }
  }

  async function text(path: string): Promise<string | null> {
    const response = await get(path, 'application/vnd.github.raw+json')
    if (!response) return null
    const body = await response.text()
    return body.length > 400_000 ? null : body
  }

  return { json, text }
}

async function latestVersion(eco: Ecosystem, name: string, fetchImpl: typeof fetch): Promise<string | null> {
  const get = async (url: string) => {
    try {
      const r = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': 'devexplore-insights (https://github.com)' } })
      return r.ok ? ((await r.json()) as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  const enc = encodeURIComponent
  if (eco === 'npm') {
    const j = await get(`https://registry.npmjs.org/${name.startsWith('@') ? `@${enc(name.slice(1))}` : enc(name)}/latest`)
    return typeof j?.version === 'string' ? j.version : null
  }
  if (eco === 'pip') {
    const j = await get(`https://pypi.org/pypi/${enc(name)}/json`)
    const v = (j?.info as { version?: unknown } | undefined)?.version
    return typeof v === 'string' ? v : null
  }
  if (eco === 'rust') {
    const j = await get(`https://crates.io/api/v1/crates/${enc(name)}`)
    const v = (j?.crate as { max_stable_version?: unknown; max_version?: unknown } | undefined)
    const version = v?.max_stable_version ?? v?.max_version
    return typeof version === 'string' ? version : null
  }
  if (/[A-Z]/.test(name)) return null // Go escapes capitals as !x; not worth supporting here
  const j = await get(`https://proxy.golang.org/${name}/@latest`)
  return typeof j?.Version === 'string' ? j.Version.replace(/^v/, '') : null
}

const ADVISORY_ECOSYSTEM: Record<Ecosystem, string> = { npm: 'npm', pip: 'pip', rust: 'rust', go: 'go' }

/* ---------- Builder ---------- */

interface RepoListItem {
  name: string
  full_name: string
  fork: boolean
  archived: boolean
  html_url: string
}

export async function buildInsights(username: string, deps: InsightsDeps): Promise<ProjectInsights> {
  const budget = new Budget()
  const gh = makeGithub(deps, budget)
  const now = (deps.now ?? (() => new Date()))()

  const repoList = await deps.fetchImpl(
    `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?per_page=30&sort=pushed&direction=desc&type=owner`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${deps.token}`,
        'user-agent': 'devexplore-insights',
        'x-github-api-version': '2022-11-28',
      },
    },
  )
  if (repoList.status === 404) throw new InsightsError(404, 'User not found')
  if (!repoList.ok) {
    const limited = repoList.headers.get('x-ratelimit-remaining') === '0'
    throw new InsightsError(limited ? 429 : 502, limited ? 'GitHub rate limit reached' : 'Could not list repositories')
  }
  const all = (await repoList.json()) as RepoListItem[]
  const repos = (Array.isArray(all) ? all : []).filter((r) => !r.fork && !r.archived).slice(0, MAX_REPOS)

  /* --- releases --- */
  const perRepo = await mapLimit(repos.slice(0, MAX_RELEASE_REPOS), CONCURRENCY, async (repo) => {
    const releases = await gh.json<
      Array<{ tag_name: string; name: string | null; body: string | null; prerelease: boolean; draft: boolean; published_at: string | null; html_url: string }>
    >(`/repos/${repo.full_name}/releases?per_page=${RELEASES_PER_REPO + 1}`)
    const real = (releases ?? []).filter((r) => !r.draft && r.published_at)
    return { repo, real }
  })

  const releaseItems: ReleaseItem[] = []
  let tagFallbacks = 0
  for (const { repo, real } of perRepo) {
    if (real.length > 0) {
      releaseItems.push(
        ...withGaps(
          real.map((r) => ({
            repo: repo.full_name,
            tag: r.tag_name,
            kind: releaseKind(r.tag_name, r.prerelease),
            prerelease: r.prerelease,
            publishedAt: r.published_at as string,
            notes: clean(r.body ?? '') || clean(r.name ?? ''),
            url: r.html_url,
            source: 'release' as const,
          })),
        ).slice(0, RELEASES_PER_REPO),
      )
    } else if (tagFallbacks < MAX_TAG_FALLBACK_REPOS) {
      // Many projects (the Linux kernel, for one) only publish tags. Use the tagged commit's date and message.
      tagFallbacks++
      const tags = await gh.json<Array<{ name: string; commit: { sha: string } }>>(`/repos/${repo.full_name}/tags?per_page=${RELEASES_PER_REPO + 1}`)
      const dated = await mapLimit((tags ?? []).slice(0, RELEASES_PER_REPO + 1), CONCURRENCY, async (tag) => {
        const commit = await gh.json<{ commit: { message: string; committer: { date: string } | null; author: { date: string } | null } }>(
          `/repos/${repo.full_name}/commits/${tag.commit.sha}`,
        )
        const date = commit?.commit.committer?.date ?? commit?.commit.author?.date
        if (!commit || !date) return null
        const pre = parseSemver(tag.name)?.pre !== null && parseSemver(tag.name)?.pre !== undefined
        return {
          repo: repo.full_name,
          tag: tag.name,
          kind: releaseKind(tag.name, pre),
          prerelease: pre,
          publishedAt: date,
          notes: clean(commit.commit.message.split('\n')[0] ?? ''),
          url: `${repo.html_url}/releases/tag/${encodeURIComponent(tag.name)}`,
          source: 'tag' as const,
        }
      })
      releaseItems.push(...withGaps(dated.filter((d): d is NonNullable<typeof d> => d !== null)).slice(0, RELEASES_PER_REPO))
    }
  }
  releaseItems.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  const timeline = releaseItems.filter((r) => Date.parse(r.publishedAt) <= now.getTime() + DAY_MS).slice(0, MAX_RELEASES)

  /* --- tech stack --- */
  const manifests: ProjectInsights['stack']['manifests'] = []
  const deps_: Array<RawDep & { repo: string }> = []
  const stackRepos = repos.slice(0, MAX_STACK_REPOS)
  await mapLimit(stackRepos, CONCURRENCY, async (repo) => {
    const root = await gh.json<Array<{ name: string; type: string }>>(`/repos/${repo.full_name}/contents`)
    const found = (root ?? []).filter((e) => e.type === 'file' && e.name in MANIFESTS)
    for (const entry of found) {
      const meta = MANIFESTS[entry.name]
      if (!meta) continue
      manifests.push({ repo: repo.name, file: entry.name, label: meta.label })
      if (meta.parse) {
        const body = await gh.text(`/repos/${repo.full_name}/contents/${encodeURIComponent(entry.name)}`)
        if (body) deps_.push(...meta.parse(body).map((d) => ({ ...d, repo: repo.name })))
      }
    }
  })

  const seen = new Set<string>()
  const unique = deps_
    .filter((d) => {
      const key = `${d.ecosystem}:${d.name}:${d.version}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_PACKAGES)

  const packages = await mapLimit(unique, CONCURRENCY, async (dep): Promise<StackPackage> => {
    const [latest, advisories] = await Promise.all([
      latestVersion(dep.ecosystem, dep.name, deps.fetchImpl),
      gh.json<Array<{ ghsa_id: string; summary: string; severity: string; html_url: string }>>(
        `/advisories?ecosystem=${ADVISORY_ECOSYSTEM[dep.ecosystem]}&affects=${encodeURIComponent(`${dep.name}@${dep.version}`)}&per_page=1&type=reviewed`,
      ),
    ])
    const advisory = advisories?.[0]
    return {
      name: dep.name,
      repo: dep.repo,
      ecosystem: dep.ecosystem,
      installed: dep.version,
      latest,
      status: packageStatus(dep.version, latest, Boolean(advisory)),
      advisory: advisory ? { id: advisory.ghsa_id, summary: clean(advisory.summary).slice(0, 140), severity: advisory.severity, url: advisory.html_url } : null,
    }
  })

  if (budget.rateLimited && timeline.length === 0 && packages.length === 0) {
    throw new InsightsError(429, 'GitHub rate limit reached')
  }

  return {
    login: username.toLowerCase(),
    generatedAt: now.toISOString(),
    releases: { cadenceDays: cadenceDays(timeline), items: timeline },
    stack: { manifests: manifests.slice(0, 12), packages },
  }
}
