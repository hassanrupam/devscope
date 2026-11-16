import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { reportSchema, type Report } from '../github/schema'
import type { SharedCache } from './cacheFirst'
import { fetchedAtSchema } from './shared'
import { supabase } from './supabaseClient'

/** Shared cache of a user's activity report, keyed by lower-cased username. */
export type ReportCache = SharedCache<Report>

const cachedRowSchema = z.object({
  report: reportSchema,
  fetched_at: fetchedAtSchema,
})

const timestampSchema = z.string().pipe(z.coerce.date())

export function createSupabaseReportCache(client: SupabaseClient): ReportCache {
  return {
    async get(username) {
      const { data, error } = await client.rpc('get_cached_report', { p_username: username })
      if (error) throw error
      if (data === null || data === undefined) return null
      const parsed = cachedRowSchema.safeParse(data)
      if (!parsed.success) return null // malformed (or older-shaped) row = miss, it gets rebuilt
      return { data: parsed.data.report, fetchedAt: parsed.data.fetched_at }
    },

    async acquireLock(username) {
      const { data, error } = await client.rpc('acquire_report_refresh_lock', { p_username: username })
      if (error) throw error
      return data === true
    },

    async releaseLock(username) {
      const { error } = await client.rpc('release_report_refresh_lock', { p_username: username })
      if (error) throw error
    },

    async save(username, report) {
      const { data, error } = await client.rpc('upsert_cached_report', {
        p_username: username,
        p_report: report,
      })
      if (error) throw error
      return timestampSchema.parse(data)
    },
  }
}

/** null when Supabase is not configured. */
export const reportCache: ReportCache | null = supabase ? createSupabaseReportCache(supabase) : null
