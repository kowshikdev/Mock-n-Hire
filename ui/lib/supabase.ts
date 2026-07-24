import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Singleton Supabase client. Import this everywhere rather than calling
 * createClient() again -- a second GoTrue client on the same page races the
 * first for the refresh token, and supabase-js warns about it. (The
 * interview summary page used to do exactly that.)
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

/*
 * A hand-written `Database` type used to live here. It was deleted rather
 * than trimmed:
 *
 *   - Three of its six tables (`profiles`, `screenings`,
 *     `interview_sessions`) do not exist in the real schema and were never
 *     queried -- they described an earlier design.
 *   - The three that do exist had drifted from the actual columns.
 *   - After this refactor nothing imported the type at all.
 *
 * Hand-maintaining a schema mirror is how it drifted in the first place.
 * Real types should be generated from supabase/migrations via
 * `supabase gen types typescript` when they're wanted -- tracked in
 * issue #8.
 */
