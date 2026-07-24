"use client"

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchCurrentUser } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * Hydrates the client-side user store from the Supabase session. That is
 * ALL it does -- routing is not its job.
 *
 * It used to also call router.replace(), which caused two real bugs:
 *
 *   1. `router.replace('/auth/login')` ran whenever a session was absent.
 *      supabase-js fires `onAuthStateChange` with an INITIAL_SESSION event
 *      and a null session on first load for logged-out visitors, so every
 *      anonymous visitor hitting the public landing page was immediately
 *      bounced to the login screen -- the marketing site was unreachable
 *      to exactly the people it exists for.
 *
 *   2. `router.replace('/dashboard/<role>')` ran on session detection, in a
 *      race with the initial checkSession() below. Whichever resolved first
 *      won, so refreshing /settings or /session-history while logged in
 *      would sometimes throw the user back to the dashboard.
 *
 * middleware.ts already gates every protected route and redirects
 * authenticated users away from the auth pages, so both redirects here were
 * redundant on top of being wrong.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAppStore()
  // Tracks which user id has already been hydrated, so repeated auth events
  // (a token refresh fires one every hour) don't re-query the users table.
  const hydratedFor = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const hydrate = async (userId: string) => {
      if (hydratedFor.current === userId) return
      try {
        const profile = await fetchCurrentUser(userId, 20) // 20 x 300ms = 6s max
        if (cancelled) return
        setUser(profile)
        hydratedFor.current = userId
      } catch (err) {
        // A first-time OAuth user has no row in `users` yet -- the callback
        // route sends them to /auth/select-role to create one. Nothing to
        // recover here, so wait for the next auth event rather than
        // surfacing an error the user cannot act on.
        console.warn('Profile hydration deferred:', err)
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
        hydratedFor.current = null
        return
      }
      void hydrate(session.user.id)
    })

    const checkSession = async () => {
      setLoading(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) {
          setUser(null)
          return
        }
        await hydrate(session.user.id)
      } catch (error) {
        console.warn('Initial session check failed:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void checkSession()

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [setUser, setLoading])

  return <>{children}</>
}
