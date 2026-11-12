import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { githubProfileSchema, type GitHubProfile } from '../github/schema'
import { fetchedAtSchema } from './shared'
import { supabase } from './supabaseClient'

export interface CachedProfile {
  profile: GitHubProfile
  fetchedAt: Date
}

/** Shared (cross-visitor) profile cache. Methods throw if the cache service is unavailable. */
export interface ProfileCache {
  get(username: string): Promise<CachedProfile | null>
  /** True if this caller may refresh the profile; false if someone else already is. */
  acquireLock(username: string): Promise<boolean>
  releaseLock(username: string): Promise<void>
  /** Saves and returns the server-side refresh timestamp. */
  save(username: string, profile: GitHubProfile): Promise<Date>
}

const cachedRowSchema = z.object({
  profile: githubProfileSchema,
  fetched_at: fetchedAtSchema,
})

const timestampSchema = z.string().pipe(z.coerce.date())

export function createSupabaseProfileCache(client: SupabaseClient): ProfileCache {
  return {
    async get(username) {
      const { data, error } = await client.rpc('get_cached_profile', { p_username: username })
      if (error) throw error
      if (data === null || data === undefined) return null
      const parsed = cachedRowSchema.safeParse(data)
      // A malformed cache row is treated as a miss rather than an error.
      if (!parsed.success) return null
      return { profile: parsed.data.profile, fetchedAt: parsed.data.fetched_at }
    },

    async acquireLock(username) {
      const { data, error } = await client.rpc('acquire_profile_refresh_lock', { p_username: username })
      if (error) throw error
      return data === true
    },

    async releaseLock(username) {
      const { error } = await client.rpc('release_profile_refresh_lock', { p_username: username })
      if (error) throw error
    },

    async save(username, profile) {
      const { data, error } = await client.rpc('upsert_cached_profile', {
        p_username: username,
        p_profile: profile,
      })
      if (error) throw error
      return timestampSchema.parse(data)
    },
  }
}

/** null when Supabase is not configured. */
export const profileCache: ProfileCache | null = supabase ? createSupabaseProfileCache(supabase) : null
