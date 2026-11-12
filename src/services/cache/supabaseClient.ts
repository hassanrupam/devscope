import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config, isCacheConfigured } from '@/config'

/** null when the public env vars are not set; the app then runs without the shared cache. */
export const supabase: SupabaseClient | null = isCacheConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      // No auth in this MVP: do not persist sessions or touch localStorage.
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null
