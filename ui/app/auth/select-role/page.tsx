"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { EnhancedGlassButton } from "@/components/ui/enhanced-glass-button"
import { EnhancedGlassCard } from "@/components/ui/enhanced-glass-card"
import { supabase } from "@/lib/supabase"
import { useAppStore } from "@/lib/store"
import { motion } from "framer-motion"
import { Brain, Users, GraduationCap } from "lucide-react"
import { toast } from "sonner"

// Reached only for a first-time OAuth (Google/GitHub) sign-in: those never
// go through signUp()'s explicit insert into `users` (there's no form to
// collect a role from), so app/auth/callback/page.tsx redirects here when
// it finds an authenticated session with no matching `users` row yet.
export default function SelectRolePage() {
  const router = useRouter()
  const { setUser } = useAppStore()
  const [isSaving, setIsSaving] = useState<'recruiter' | 'student' | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.user) {
        router.push('/auth/login')
        return
      }
      setEmail(data.session.user.email ?? null)
    })
  }, [router])

  const handleSelect = async (role: 'recruiter' | 'student') => {
    setIsSaving(role)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (sessionError || !user) {
        toast.error('Session expired, please sign in again')
        router.push('/auth/login')
        return
      }

      const name = (user.user_metadata?.full_name || user.user_metadata?.name || user.email || '') as string

      const { data: profile, error } = await supabase
        .from('users')
        .insert({ user_id: user.id, email: user.email, name, role })
        .select()
        .single()

      if (error || !profile) {
        console.error('Failed to create profile:', error)
        toast.error('Could not save your role, please try again')
        return
      }

      setUser({
        id: profile.user_id,
        email: profile.email,
        name: profile.name,
        role: profile.role
      })

      toast.success('Welcome to Mock\'n-Hire!')
      router.push(`/dashboard/${role}`)
    } catch (error) {
      console.error('Role selection error:', error)
      toast.error('Something went wrong')
    } finally {
      setIsSaving(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center container-padding py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <EnhancedGlassCard size="lg" className="space-y-8">
          <div className="text-center space-y-4">
            <motion.div
              className="w-16 h-16 mx-auto rounded-xl gradient-bg flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Brain className="w-8 h-8 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">One more step</h1>
              <p className="text-muted-foreground">
                {email ? `Signed in as ${email}. ` : ''}How will you use Mock'n-Hire?
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <EnhancedGlassButton
              type="button"
              onClick={() => handleSelect('recruiter')}
              loading={isSaving === 'recruiter'}
              disabled={isSaving !== null}
              fullWidth
              size="lg"
              icon={<Users className="w-5 h-5" />}
            >
              I'm a Recruiter — hire talent
            </EnhancedGlassButton>
            <EnhancedGlassButton
              type="button"
              onClick={() => handleSelect('student')}
              loading={isSaving === 'student'}
              disabled={isSaving !== null}
              fullWidth
              size="lg"
              icon={<GraduationCap className="w-5 h-5" />}
            >
              I'm a Student — practice interviews
            </EnhancedGlassButton>
          </div>
        </EnhancedGlassCard>
      </motion.div>
    </div>
  )
}
