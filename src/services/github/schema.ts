import { z } from 'zod'

const nullableText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v : null))

/**
 * The subset of GET /users/{username} that DevScope uses.
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
