import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

/**
 * Singleton Supabase browser client.
 *
 * MUST be the auth-helpers client, not `createClient` from
 * @supabase/supabase-js. That distinction is the whole reason sign-in
 * appeared to succeed and then immediately asked you to sign in again:
 *
 *   - `createClient` persists the session in **localStorage**.
 *   - `middleware.ts` reads the session from **cookies** via
 *     `createMiddlewareClient`.
 *
 * Those two stores never see each other. So the browser believed it was
 * signed in (the navbar showed the user), while middleware saw no session
 * at all and bounced every protected route -- /dashboard, /interview,
 * /session-history, /settings -- straight back to /auth/login. The app was
 * effectively unusable while "signed in".
 *
 * `createClientComponentClient` writes the session to cookies, which the
 * middleware and any future server component can both read. Keep this as
 * the single shared instance: a second client racing this one for the same
 * refresh token is its own class of bug (the interview summary page used to
 * create one).
 */
export const supabase = createClientComponentClient()
