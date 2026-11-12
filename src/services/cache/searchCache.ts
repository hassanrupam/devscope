import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { searchUserSchema, type SearchUser } from '../github/schema'
import type { SharedCache } from './cacheFirst'
import { fetchedAtSchema } from './shared'
import { supabase } from './supabaseClient'

/** Shared cache of "users whose login starts with <prefix>" results, keyed by the prefix. */
export type SearchCache = SharedCache<SearchUser[]>

const cachedRowSchema = z.object({
  results: z.array(searchUserSchema),
  fetched_at: fetchedAtSchema,
})

const timestampSchema = z.string().pipe(z.coerce.date())

export function createSupabaseSearchCache(client: SupabaseClient): SearchCache {
  return {
    async get(prefix) {
      const { data, error } = await client.rpc('get_cached_search', { p_prefix: prefix })
      if (error) throw error
      if (data === null || data === undefined) return null
      const parsed = cachedRowSchema.safeParse(data)
      if (!parsed.success) return null // malformed row = miss
      return { data: parsed.data.results, fetchedAt: parsed.data.fetched_at }
    },

    async acquireLock(prefix) {
      const { data, error } = await client.rpc('acquire_search_refresh_lock', { p_prefix: prefix })
      if (error) throw error
      return data === true
    },

    async releaseLock(prefix) {
      const { error } = await client.rpc('release_search_refresh_lock', { p_prefix: prefix })
      if (error) throw error
    },

    async save(prefix, users) {
      const { data, error } = await client.rpc('upsert_cached_search', {
        p_prefix: prefix,
        p_results: users,
      })
      if (error) throw error
      return timestampSchema.parse(data)
    },
  }
}

/** null when Supabase is not configured. */
export const searchCache: SearchCache | null = supabase ? createSupabaseSearchCache(supabase) : null
