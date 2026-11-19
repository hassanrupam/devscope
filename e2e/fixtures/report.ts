/**
 * Deterministic mock data for the developer-report e2e tests: a believable year of activity,
 * repositories, collaborators and sentiment for a user called "octocat".
 */

const DAY = 86_400_000

/** Small seeded PRNG so every run draws the same heatmap. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export function calendarCounts(days = 371, seed = 7): { start: string; counts: number[] } {
  const rand = rng(seed)
  const end = Date.UTC(2026, 10, 16) // 2026-11-16
  const startMs = end - (days - 1) * DAY
  const counts = Array.from({ length: days }, (_, i) => {
    const weekday = new Date(startMs + i * DAY).getUTCDay()
    const weekend = weekday === 0 || weekday === 6
    const burst = Math.sin(i / 17) > 0.55 ? 3 : 1 // busy phases
    const roll = rand()
    if (roll < (weekend ? 0.7 : 0.25)) return 0
    const base = Math.floor(rand() * (weekend ? 4 : 10) * burst)
    // a few legendary days
    return rand() > 0.985 ? base + 25 + Math.floor(rand() * 25) : base
  })
  // guarantee a visible recent streak
  for (let i = days - 9; i < days; i++) counts[i] = Math.max(counts[i] ?? 0, 2 + (i % 5))
  return { start: new Date(startMs).toISOString().slice(0, 10), counts }
}

const avatar = (n: number) => `https://avatars.githubusercontent.com/u/${n}?v=4`

export const profile = {
  id: 583231,
  login: 'octocat',
  type: 'User',
  avatar_url: avatar(583231),
  html_url: 'https://github.com/octocat',
  name: 'The Octocat',
  bio: 'Mascot of GitHub. Building tiny tools for big teams.',
  company: '@github',
  location: 'San Francisco',
  blog: 'https://github.blog',
  public_repos: 12,
  followers: 18420,
  following: 9,
  created_at: '2011-01-25T18:44:36Z',
}

const repo = (id: number, name: string, language: string | null, stars: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  html_url: `https://github.com/octocat/${name}`,
  description: `${name} — a demo repository`,
  language,
  stargazers_count: stars,
  forks_count: Math.floor(stars / 7),
  fork: false,
  archived: false,
  pushed_at: '2026-10-20T00:00:00Z',
  ...extra,
})

export const repos = [
  repo(1, 'hello-world', 'Ruby', 2400),
  repo(2, 'spoon-knife', 'Ruby', 1300),
  repo(3, 'linguist', 'Ruby', 640),
  repo(4, 'git-consortium', 'Ruby', 88),
  repo(5, 'octo-cache', 'Elixir', 960),
  repo(6, 'phoenix-notes', 'Elixir', 210),
  repo(7, 'kevala', 'Elixir', 31),
  repo(8, 'ui-kit', 'CSS', 520),
  repo(9, 'dotfiles', 'CSS', 44),
  repo(10, 'playground', 'JavaScript', 12),
  repo(11, 'forked-rails', 'Ruby', 99999, { fork: true }),
]

const person = (login: string, id: number, contributions: number) => ({ login, avatarUrl: avatar(id), contributions })

const netRepo = (nameWithOwner: string, stars: number, contributions: number, external: boolean, ownerId: number, people: ReturnType<typeof person>[]) => ({
  nameWithOwner,
  url: `https://github.com/${nameWithOwner}`,
  ownerLogin: nameWithOwner.split('/')[0] as string,
  ownerAvatar: avatar(ownerId),
  stars,
  contributions,
  external,
  contributors: people,
})

export const report = {
  login: 'octocat',
  generatedAt: '2026-11-16T05:00:00Z',
  calendar: calendarCounts(),
  totals: { contributions: 1893, commits: 1520, pullRequests: 214, issues: 61, reviews: 98 },
  starsByYear: [
    { year: 2011, repos: 2, stars: 3700 },
    { year: 2013, repos: 1, stars: 640 },
    { year: 2016, repos: 3, stars: 1100 },
    { year: 2019, repos: 2, stars: 560 },
    { year: 2023, repos: 4, stars: 130 },
  ],
  collaboration: {
    repos: [
      netRepo('rails/rails', 55000, 142, true, 4223, [person('dhh', 2741, 5400), person('rafaelfranca', 47848, 3100), person('tenderlove', 3124, 2200)]),
      netRepo('elixir-lang/elixir', 24000, 63, true, 1481, [person('josevalim', 9582, 7000), person('wojtekmach', 2430, 1200), person('fertapric', 17034, 400)]),
      netRepo('octocat/hello-world', 2400, 55, false, 583231, [person('mona', 22, 80), person('hubot', 37, 50)]),
      netRepo('vercel/next.js', 130000, 31, true, 14985020, [person('timneutkens', 6, 3000), person('ijjk', 22, 2500), person('shuding', 3676, 1900)]),
      netRepo('octocat/octo-cache', 960, 24, false, 583231, [person('mona', 22, 30)]),
      netRepo('tailwindlabs/tailwindcss', 85000, 12, true, 67109815, [person('adamwathan', 4323, 2000), person('RobinMalfait', 1736, 1500)]),
    ],
    topCoContributors: [
      { login: 'mona', avatarUrl: avatar(22), sharedRepos: 2, contributions: 110 },
      { login: 'josevalim', avatarUrl: avatar(9582), sharedRepos: 1, contributions: 7000 },
      { login: 'dhh', avatarUrl: avatar(2741), sharedRepos: 1, contributions: 5400 },
      { login: 'timneutkens', avatarUrl: avatar(6), sharedRepos: 1, contributions: 3000 },
      { login: 'adamwathan', avatarUrl: avatar(4323), sharedRepos: 1, contributions: 2000 },
    ],
  },
  sentiment: {
    score: 0.46,
    sampleSize: 61,
    words: [
      ['pullrequest', 22, 0], ['thanks', 19, 1], ['cache', 17, 0], ['issue', 15, 0], ['comment', 14, 0], ['great', 13, 1],
      ['review', 12, 0], ['timeout', 11, -1], ['docs', 10, 0], ['merge', 9, 0], ['nice', 9, 1], ['broken', 8, -1],
      ['config', 8, 0], ['release', 7, 0], ['works', 7, 1], ['upgrade', 6, 0], ['error', 6, -1], ['tests', 6, 0],
      ['agree', 5, 1], ['parser', 5, 0], ['elixir', 4, 0], ['rails', 4, 0], ['frequency', 3, 0], ['problem', 3, -1],
      ['helper', 3, 0], ['lgtm', 3, 1], ['routing', 2, 0], ['sentiment', 2, 0], ['native', 2, 0], ['perf', 2, 0],
    ].map(([text, count, tone]) => ({ text, count, tone })),
  },
}

const ago = (days: number) => new Date(Date.UTC(2026, 10, 18) - days * DAY).toISOString()

/** Release timeline + stack radar for "octocat" (what /users/octocat/insights returns). */
export const insights = {
  login: 'octocat',
  generatedAt: '2026-11-18T12:00:00.000Z',
  releases: {
    cadenceDays: 7,
    items: [
      { repo: 'octocat/linux', tag: 'v6.13-rc3', kind: 'pre', prerelease: true, publishedAt: ago(2), sincePrevDays: 7, sincePrevTag: 'v6.13-rc2', notes: "Merge tag 'vfs-6.13-rc3', x86/mm TLB flush optimizations, and DRM subsystem fixes.", url: 'https://github.com/octocat/linux/releases/tag/v6.13-rc3', source: 'tag' },
      { repo: 'octocat/linux', tag: 'v6.13-rc2', kind: 'pre', prerelease: true, publishedAt: ago(9), sincePrevDays: 7, sincePrevTag: 'v6.13-rc1', notes: 'Networking pull request updates and arm64 DT fixes.', url: 'https://github.com/octocat/linux/releases/tag/v6.13-rc2', source: 'tag' },
      { repo: 'octocat/audionoise', tag: 'v1.4.0', kind: 'minor', prerelease: false, publishedAt: ago(24), sincePrevDays: 19, sincePrevTag: 'v1.3.2', notes: 'Added real-time IIR biquad filter coefficients generator.', url: 'https://github.com/octocat/audionoise/releases/tag/v1.4.0', source: 'release' },
    ],
  },
  stack: {
    manifests: [
      { repo: 'audionoise', file: 'package.json', label: 'Node / npm' },
      { repo: 'linux', file: 'Kconfig', label: 'Kernel build' },
    ],
    packages: [
      { name: 'react', repo: 'audionoise', ecosystem: 'npm', installed: '18.0.0', latest: '19.2.0', status: 'outdated', advisory: null },
      { name: 'lodash', repo: 'audionoise', ecosystem: 'npm', installed: '4.17.15', latest: '4.17.21', status: 'advisory', advisory: { id: 'GHSA-35jh-r3h4-6jhm', summary: 'Command injection in lodash', severity: 'high', url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm' } },
      { name: 'vite', repo: 'audionoise', ecosystem: 'npm', installed: '7.0.0', latest: '7.0.0', status: 'current', advisory: null },
    ],
  },
}
