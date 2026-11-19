import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { insightsSchema, type ProjectInsights } from '../github/schema'
import type { SharedCache } from './cacheFirst'
import { fetchedAtSchema } from './shared'
import { supabase } from './supabaseClient'

/** Shared cache of a user's project insights (releases + stack radar), keyed by lower-cased username. */
export type InsightsCache = SharedCache<ProjectInsights>

const cachedRowSchema = z.object({ insights: insightsSchema, fetched_at: fetchedAtSchema })
const timestampSchema = z.string().pipe(z.coerce.date())

export function createSupabaseInsightsCache(client: SupabaseClient): InsightsCache {
  return {
    async get(username) {
      const { data, error } = await client.rpc('get_cached_insights', { p_username: username })
      if (error) throw error
      if (data === null || data === undefined) return null
      const parsed = cachedRowSchema.safeParse(data)
      if (!parsed.success) return null
      return { data: parsed.data.insights, fetchedAt: parsed.data.fetched_at }
    },
    async acquireLock(username) {
      const { data, error } = await client.rpc('acquire_insights_refresh_lock', { p_username: username })
      if (error) throw error
      return data === true
    },
    async releaseLock(username) {
      const { error } = await client.rpc('release_insights_refresh_lock', { p_username: username })
      if (error) throw error
    },
    async save(username, insights) {
      const { data, error } = await client.rpc('upsert_cached_insights', { p_username: username, p_insights: insights })
      if (error) throw error
      return timestampSchema.parse(data)
    },
  }
}

/** null when Supabase is not configured. */
export const insightsCache: InsightsCache | null = supabase ? createSupabaseInsightsCache(supabase) : null
