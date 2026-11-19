import { z } from 'zod'

const nullableText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v : null))

/**
 * The subset of GET /users/{username} that DevExplore uses.
 * Unknown fields are dropped, so only these fields are ever stored in the cache.
 */
export const githubProfileSchema = z.object({
  id: z.number().int(),
  login: z.string().min(1),
  type: z.string().default('User'),
  avatar_url: z.httpUrl(),
  html_url: z.httpUrl(),
  name: nullableText,
  bio: nullableText,
  company: nullableText,
  location: nullableText,
  blog: nullableText,
  public_repos: z.number().int().nonnegative().default(0),
  followers: z.number().int().nonnegative().default(0),
  following: z.number().int().nonnegative().default(0),
  created_at: z.string().nullish().transform((v) => v ?? null),
})

export type GitHubProfile = z.infer<typeof githubProfileSchema>

/** One entry of GET /search/users (GitHub only returns identity fields here, not bio/stats). */
export const searchUserSchema = z.object({
  id: z.number().int(),
  login: z.string().min(1),
  type: z.string().default('User'),
  avatar_url: z.httpUrl(),
  html_url: z.httpUrl(),
})

export type SearchUser = z.infer<typeof searchUserSchema>

export const searchResponseSchema = z.object({ items: z.array(searchUserSchema) })

/**
 * One entry of GET /users/{username}/repos, reduced to the fields DevExplore uses.
 * Only these fields are stored in the shared cache.
 */
export const repoSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  html_url: z.httpUrl(),
  description: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim().slice(0, 200) : null)),
  language: nullableText,
  stargazers_count: z.number().int().nonnegative().default(0),
  forks_count: z.number().int().nonnegative().default(0),
  fork: z.boolean().default(false),
  archived: z.boolean().default(false),
  pushed_at: z.string().nullish().transform((v) => v ?? null),
})

export type Repo = z.infer<typeof repoSchema>


/* ---------------------------------------------------------------------------------------------
 * Developer report: one compact document built by the github-proxy edge function
 * (GET /users/{username}/report) and stored in the shared cache as-is.
 * ------------------------------------------------------------------------------------------- */

const count = z.number().int().nonnegative()

const reportContributorSchema = z.object({
  login: z.string().min(1),
  avatarUrl: z.httpUrl(),
  contributions: count,
})

const reportNetworkRepoSchema = z.object({
  nameWithOwner: z.string().min(3),
  url: z.httpUrl(),
  ownerLogin: z.string().min(1),
  ownerAvatar: z.httpUrl(),
  stars: count,
  contributions: count,
  external: z.boolean(),
  contributors: z.array(reportContributorSchema).max(8),
})

export const reportSchema = z.object({
  login: z.string().min(1),
  generatedAt: z.string(),
  calendar: z.object({
    /** YYYY-MM-DD (UTC) of the first entry in `counts`. Empty when GitHub returned no calendar. */
    start: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    counts: z.array(count).max(400),
  }),
  totals: z.object({
    contributions: count,
    commits: count,
    pullRequests: count,
    issues: count,
    reviews: count,
  }),
  starsByYear: z.array(z.object({ year: z.number().int(), repos: count, stars: count })).max(40),
  collaboration: z.object({
    repos: z.array(reportNetworkRepoSchema).max(10),
    topCoContributors: z
      .array(z.object({ login: z.string().min(1), avatarUrl: z.httpUrl(), sharedRepos: count, contributions: count }))
      .max(10),
  }),
  sentiment: z.object({
    /** -1 (critical) .. 0 (neutral) .. +1 (happy) */
    score: z.number().min(-1).max(1),
    sampleSize: count,
    words: z
      .array(z.object({ text: z.string().min(1), count, tone: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }))
      .max(60),
  }),
})

export type Report = z.infer<typeof reportSchema>
export type ReportNetworkRepo = Report['collaboration']['repos'][number]

const insightRelease = z.object({
  repo: z.string().min(1),
  tag: z.string().min(1),
  kind: z.enum(['major', 'minor', 'patch', 'pre']),
  prerelease: z.boolean(),
  publishedAt: z.string(),
  sincePrevDays: z.number().int().nonnegative().nullable(),
  sincePrevTag: z.string().nullable(),
  notes: z.string().max(400),
  url: z.httpUrl(),
  source: z.enum(['release', 'tag']),
})

const insightPackage = z.object({
  name: z.string().min(1),
  repo: z.string().min(1),
  ecosystem: z.enum(['npm', 'pip', 'rust', 'go']),
  installed: z.string().min(1),
  latest: z.string().nullable(),
  status: z.enum(['current', 'outdated', 'advisory']),
  advisory: z
    .object({ id: z.string(), summary: z.string(), severity: z.string(), url: z.httpUrl() })
    .nullable(),
})

/** Release timeline + tech-stack radar built by the proxy from free GitHub REST endpoints. */
export const insightsSchema = z.object({
  login: z.string().min(1),
  generatedAt: z.string(),
  releases: z.object({ cadenceDays: z.number().nonnegative().nullable(), items: z.array(insightRelease).max(12) }),
  stack: z.object({
    manifests: z.array(z.object({ repo: z.string(), file: z.string(), label: z.string() })).max(16),
    packages: z.array(insightPackage).max(60),
  }),
})

export type ProjectInsights = z.infer<typeof insightsSchema>
export type InsightRelease = ProjectInsights['releases']['items'][number]
export type InsightPackage = ProjectInsights['stack']['packages'][number]
