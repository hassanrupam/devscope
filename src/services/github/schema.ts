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

