"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Github, GraduationCap, Users } from "lucide-react"
import { toast } from "sonner"

import { useAppStore } from "@/lib/store"
import { signIn, signUp, signInWithGoogle, signInWithGithub } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/states"
import { OrbField } from "@/components/ui/orb"
import { Wordmark } from "@/components/layout/wordmark"

type Role = "recruiter" | "student"

/** Google's mark. lucide's `Chrome` icon is a browser logo, not a Google logo. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.17-2 3.44-4.95 3.44-8.56Z" />
      <path fill="#34A853" d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z" />
      <path fill="#FBBC05" d="M5.55 14.17a6.9 6.9 0 0 1 0-4.34V6.85H1.7a11.5 11.5 0 0 0 0 10.3l3.85-2.98Z" />
      <path fill="#EA4335" d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.31 15.11.25 12 .25A11.5 11.5 0 0 0 1.7 6.85l3.85 2.98C6.46 7.11 9 4.75 12 4.75Z" />
    </svg>
  )
}

function AuthForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setUser } = useAppStore()

  const [isSignup, setIsSignup] = useState(searchParams.get("mode") === "signup")
  const [role, setRole] = useState<Role>("student")
  const [isLoading, setIsLoading] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<"google" | "github" | null>(null)
  const [form, setForm] = useState({ email: "", password: "", name: "", confirmPassword: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev))
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.email) next.email = "Email is required"
    else if (!/\S+@\S+\.\S+/.test(form.email)) next.email = "Enter a valid email address"

    if (!form.password) next.password = "Password is required"
    else if (form.password.length < 6) next.password = "Use at least 6 characters"

    if (isSignup) {
      if (!form.name) next.name = "Name is required"
      if (form.password !== form.confirmPassword) next.confirmPassword = "Passwords don't match"
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsLoading(true)

    try {
      const result = isSignup
        ? await signUp(form.email, form.password, form.name, role)
        : await signIn(form.email, form.password)

      if (result.error) {
        toast.error(
          isSignup
            ? "Could not create that account. The email may already be registered."
            : "Invalid email or password."
        )
        return
      }

      const profile = result.data?.profile
      if (!profile) {
        // signUp succeeds but returns no profile when email confirmation is
        // enabled on the Supabase project -- the row is created, but there
        // is no session yet. Telling the user to check their inbox is the
        // correct outcome here, not an error.
        toast.success(
          isSignup ? "Account created. Check your email to confirm it." : "Signed in."
        )
        return
      }

      setUser({
        id: profile.user_id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
      })
      toast.success(isSignup ? "Account created." : "Welcome back.")
      router.push(`/dashboard/${profile.role}`)
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuth = async (provider: "google" | "github") => {
    setPendingProvider(provider)
    try {
      const { error } =
        provider === "google" ? await signInWithGoogle() : await signInWithGithub()
      if (error) {
        toast.error(`Could not sign in with ${provider === "google" ? "Google" : "GitHub"}.`)
        setPendingProvider(null)
      }
      // On success the browser navigates away to the provider, so the
      // pending state is intentionally left set.
    } catch {
      toast.error("Something went wrong. Please try again.")
      setPendingProvider(null)
    }
  }

  const busy = isLoading || pendingProvider !== null

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden py-xxl">
      <OrbField variant="corner" />

      <div className="container-content">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/"
            className="mb-lg inline-flex items-center gap-xs text-caption text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>

          <Card variant="panel" className="flex flex-col gap-lg">
            <div className="flex flex-col gap-xs">
              <Wordmark />
              <h1 className="font-display text-display-sm text-ink md:text-display-md">
                {isSignup ? "Create your account" : "Sign in"}
              </h1>
              <p className="text-body-md text-body">
                {isSignup
                  ? "Practise interviews built from your resume, or screen candidates for a role."
                  : "Welcome back to Mock'n-Hire."}
              </p>
            </div>

            {/* OAuth */}
            <div className="grid grid-cols-2 gap-sm">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOAuth("google")}
                disabled={busy}
              >
                {pendingProvider === "google" ? <Spinner className="size-4" /> : <GoogleMark />}
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOAuth("github")}
                disabled={busy}
              >
                {pendingProvider === "github" ? <Spinner className="size-4" /> : <Github />}
                GitHub
              </Button>
            </div>

            <div className="flex items-center gap-sm">
              <span className="h-px flex-1 bg-hairline" />
              <span className="text-caption text-muted">or</span>
              <span className="h-px flex-1 bg-hairline" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-base" noValidate>
              {isSignup && (
                <fieldset className="flex flex-col gap-xs">
                  <legend className="mb-xs block text-body-strong text-ink">
                    I&rsquo;m joining as
                  </legend>
                  <div className="grid grid-cols-2 gap-sm">
                    {(
                      [
                        { value: "student", label: "Candidate", Icon: GraduationCap },
                        { value: "recruiter", label: "Recruiter", Icon: Users },
                      ] as const
                    ).map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRole(value)}
                        aria-pressed={role === value}
                        className={cn(
                          "flex flex-col items-center gap-xs rounded-lg border p-base transition-colors",
                          role === value
                            ? "border-ink bg-surface-strong text-ink"
                            : "border-hairline-strong text-body hover:border-ink"
                        )}
                      >
                        <Icon className="size-5" />
                        <span className="text-caption">{label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {isSignup && (
                <Field label="Full name" htmlFor="name" error={errors.name}>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={form.name}
                    onChange={set("name")}
                    invalid={!!errors.name}
                    placeholder="Your name"
                  />
                </Field>
              )}

              <Field label="Email" htmlFor="email" error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={set("email")}
                  invalid={!!errors.email}
                  placeholder="you@example.com"
                />
              </Field>

              <Field label="Password" htmlFor="password" error={errors.password}>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={form.password}
                  onChange={set("password")}
                  invalid={!!errors.password}
                  placeholder={isSignup ? "At least 6 characters" : "Your password"}
                />
              </Field>

              {isSignup && (
                <Field
                  label="Confirm password"
                  htmlFor="confirmPassword"
                  error={errors.confirmPassword}
                >
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={set("confirmPassword")}
                    invalid={!!errors.confirmPassword}
                    placeholder="Re-enter your password"
                  />
                </Field>
              )}

              <Button type="submit" size="lg" disabled={busy} className="mt-xs">
                {isLoading && <Spinner className="size-4 border-white/40 border-t-white" />}
                {isSignup ? "Create account" : "Sign in"}
              </Button>
            </form>

            <p className="text-center text-caption text-body">
              {isSignup ? "Already have an account?" : "New to Mock'n-Hire?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setIsSignup((s) => !s)
                  setErrors({})
                }}
                className="text-ink underline underline-offset-4"
              >
                {isSignup ? "Sign in" : "Create one"}
              </button>
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  // useSearchParams needs a Suspense boundary for this route to prerender.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  )
}
