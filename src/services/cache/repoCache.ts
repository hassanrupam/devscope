import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { repoSchema, type Repo } from '../github/schema'
import type { SharedCache } from './cacheFirst'
import { fetchedAtSchema } from './shared'
import { supabase } from './supabaseClient'

/** Shared cache of a user's repositories, keyed by lower-cased username. */
export type RepoCache = SharedCache<Repo[]>

const cachedRowSchema = z.object({
  repos: z.array(repoSchema),
  fetched_at: fetchedAtSchema,
})

const timestampSchema = z.string().pipe(z.coerce.date())

export function createSupabaseRepoCache(client: SupabaseClient): RepoCache {
  return {
    async get(username) {
      const { data, error } = await client.rpc('get_cached_repos', { p_username: username })
      if (error) throw error
      if (data === null || data === undefined) return null
      const parsed = cachedRowSchema.safeParse(data)
      if (!parsed.success) return null // malformed row = miss
      return { data: parsed.data.repos, fetchedAt: parsed.data.fetched_at }
    },

    async acquireLock(username) {
      const { data, error } = await client.rpc('acquire_repos_refresh_lock', { p_username: username })
      if (error) throw error
      return data === true
    },

    async releaseLock(username) {
      const { error } = await client.rpc('release_repos_refresh_lock', { p_username: username })
      if (error) throw error
    },

    async save(username, repos) {
      const { data, error } = await client.rpc('upsert_cached_repos', {
        p_username: username,
        p_repos: repos,
      })
      if (error) throw error
      return timestampSchema.parse(data)
    },
  }
}

/** null when Supabase is not configured. */
export const repoCache: RepoCache | null = supabase ? createSupabaseRepoCache(supabase) : null
