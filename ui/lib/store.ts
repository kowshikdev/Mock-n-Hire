import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  name: string
  role: 'recruiter' | 'student'
}

interface AppState {
  user: User | null
  theme: 'light' | 'dark' | 'system'
  accentColor: 'ice-blue' | 'aqua-green'
  loading: boolean
  showNewScreeningModal: boolean
  setUser: (user: User | null) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setAccentColor: (color: 'ice-blue' | 'aqua-green') => void
  setLoading: (loading: boolean) => void
  setShowNewScreeningModal: (show: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      theme: 'system',
      accentColor: 'ice-blue',
      loading: false,
      showNewScreeningModal: false,
      setUser: (user) => set({ user }),
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setLoading: (loading) => set({ loading }),
      setShowNewScreeningModal: (showNewScreeningModal) => set({ showNewScreeningModal }),
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        user: state.user,
        theme: state.theme,
        accentColor: state.accentColor,
      }),
    }
  )
)
