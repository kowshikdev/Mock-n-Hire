import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  role: 'recruiter' | 'student'
  name: string
}

/*
 * `theme` and `accentColor` were removed: the design system is a single
 * fixed off-white canvas with no dark variant and no accent-color choice,
 * so persisting either was storing a preference nothing could act on.
 *
 * `showSettingsModal` was also removed -- it was declared and persisted but
 * never read or set by any component (settings is a route, not a modal).
 */
interface AppState {
  // User & auth
  user: User | null
  isLoading: boolean

  // Transient UI state
  showNewScreeningModal: boolean
  currentSessionId: string | null

  // Actions
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setShowNewScreeningModal: (show: boolean) => void
  setCurrentSessionId: (id: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      showNewScreeningModal: false,
      currentSessionId: null,

      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      setShowNewScreeningModal: (showNewScreeningModal) => set({ showNewScreeningModal }),
      setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
    }),
    {
      name: 'mocknhire-storage',
      // Only the user survives a reload; modal/session state is transient.
      partialize: (state) => ({ user: state.user }),
    }
  )
)
