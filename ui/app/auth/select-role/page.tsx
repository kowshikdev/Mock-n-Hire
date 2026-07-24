"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { GraduationCap, Users } from "lucide-react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import { useAppStore } from "@/lib/store"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/states"
import { OrbField } from "@/components/ui/orb"
import { Wordmark } from "@/components/layout/wordmark"

type Role = "recruiter" | "student"

const ROLES: { value: Role; label: string; body: string; Icon: typeof Users }[] = [
  {
    value: "student",
    label: "I'm a candidate",
    body: "Practise interviews generated from your resume and get a scored review of every answer.",
    Icon: GraduationCap,
  },
  {
    value: "recruiter",
    label: "I'm a recruiter",
    body: "Upload candidate resumes in bulk and rank them against the role you're hiring for.",
    Icon: Users,
  },
]

/**
 * Reached only on a first-time OAuth (Google/GitHub) sign-in. Those never go
 * through signUp()'s explicit insert into `users` -- there is no form in an
 * OAuth redirect to collect a role -- so app/auth/callback redirects here
 * when it finds an authenticated session with no matching `users` row.
 */
export default function SelectRolePage() {
  const router = useRouter()
  const { setUser } = useAppStore()
  const [saving, setSaving] = useState<Role | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (!data.session?.user) {
        router.push("/auth/login")
        return
      }
      setEmail(data.session.user.email ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [router])

  const handleSelect = async (role: Role) => {
    setSaving(role)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (sessionError || !user) {
        toast.error("Your session expired. Please sign in again.")
        router.push("/auth/login")
        return
      }

      const name = (user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email ||
        "") as string

      const { data: profile, error } = await supabase
        .from("users")
        .insert({ user_id: user.id, email: user.email, name, role })
        .select()
        .single()

      if (error || !profile) {
        console.error("Failed to create profile:", error)
        toast.error("Could not save your role. Please try again.")
        return
      }

      setUser({
        id: profile.user_id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
      })
      router.push(`/dashboard/${role}`)
    } catch (error) {
      console.error("Role selection error:", error)
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden py-xxl">
      <OrbField variant="corner" />

      <div className="container-content">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-xl flex flex-col items-center gap-xs text-center">
            <Wordmark />
            <h1 className="font-display text-display-md text-ink">
              How will you be using Mock&rsquo;n-Hire?
            </h1>
            <p className="text-body-md text-body">
              {email ? (
                <>
                  Signed in as <span className="text-ink">{email}</span>. Pick one to
                  finish setting up your account.
                </>
              ) : (
                "Pick one to finish setting up your account."
              )}
            </p>
          </div>

          <div className="grid gap-base sm:grid-cols-2">
            {ROLES.map(({ value, label, body, Icon }) => (
              <Card key={value} variant="panel" className="flex">
                <button
                  type="button"
                  onClick={() => handleSelect(value)}
                  disabled={saving !== null}
                  className="flex w-full flex-col items-start gap-sm text-left disabled:opacity-60"
                >
                  <span className="flex size-10 items-center justify-center rounded-pill bg-surface-strong text-ink">
                    {saving === value ? <Spinner className="size-4" /> : <Icon className="size-5" />}
                  </span>
                  <span className="font-sans text-title-md text-ink">{label}</span>
                  <span className="text-body-md text-body">{body}</span>
                </button>
              </Card>
            ))}
          </div>

          <p className="mt-lg text-center text-caption text-muted">
            This can&rsquo;t be changed later from the app, so choose the one that fits.
          </p>
        </div>
      </div>
    </div>
  )
}
