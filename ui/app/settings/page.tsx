"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import { signOut } from "@/lib/auth"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/input"
import { Container } from "@/components/ui/section"
import { Spinner } from "@/components/ui/states"

/**
 * Settings.
 *
 * The previous version's save handler was a stub that toasted "Settings
 * saved successfully!" and wrote nothing anywhere -- users were told their
 * changes persisted when the next reload silently discarded them. Delete
 * Account was the same: it cleared local state and claimed "Account deleted
 * successfully" while leaving the account fully intact.
 *
 * Name now writes to the `users` row for real. Email is shown read-only:
 * changing it means re-verifying through Supabase Auth's email-change flow,
 * which this UI does not implement, and a field that silently ignores edits
 * is the exact failure being fixed here.
 *
 * Account deletion needs a service-role key to remove the auth user, so it
 * cannot be done from the browser at all. Rather than fake it, the section
 * explains how to request it.
 *
 * The Appearance panel (theme + accent colour) is gone entirely: the design
 * system has one fixed canvas, so those controls had nothing to change.
 */
export default function SettingsPage() {
  const router = useRouter()
  const { user, setUser } = useAppStore()

  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(user?.name ?? "")
  }, [user?.name])

  const dirty = name.trim() !== (user?.name ?? "").trim()

  const handleSave = async () => {
    if (!user?.id) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Name can't be empty")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({ name: trimmed })
        .eq("user_id", user.id)

      if (updateError) throw updateError

      setUser({ ...user, name: trimmed })
      toast.success("Changes saved.")
    } catch (err) {
      console.error("Failed to save settings:", err)
      toast.error("Couldn't save your changes. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    setUser(null)
    router.push("/")
  }

  if (!user) {
    return (
      <div className="section-band">
        <Container>
          <div className="flex justify-center">
            <Spinner />
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="section-band">
      <Container className="flex max-w-2xl flex-col gap-xl">
        <div className="flex flex-col gap-xs">
          <span className="eyebrow">Settings</span>
          <h1 className="font-display text-display-md text-ink md:text-display-lg">
            Your account
          </h1>
        </div>

        {/* Profile */}
        <Card variant="panel" className="flex flex-col gap-base">
          <CardTitle>Profile</CardTitle>

          <Field label="Name" htmlFor="name" error={error ?? undefined}>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              invalid={!!error}
              disabled={saving}
            />
          </Field>

          <Field
            label="Email"
            htmlFor="email"
            hint="Changing your email requires re-verification and isn't supported here yet."
          >
            <Input id="email" value={user.email} readOnly disabled />
          </Field>

          <Field label="Account type" htmlFor="role">
            <Input
              id="role"
              value={user.role === "recruiter" ? "Recruiter" : "Candidate"}
              readOnly
              disabled
            />
          </Field>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving && <Spinner className="h-4 w-4 border-white/40 border-t-white" />}
              Save changes
            </Button>
          </div>
        </Card>

        {/* Session */}
        <Card variant="panel" className="flex flex-wrap items-center justify-between gap-base">
          <div className="flex flex-col gap-xxs">
            <CardTitle className="text-title-sm">Sign out</CardTitle>
            <p className="text-body-md text-body">
              End your session on this device.
            </p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            Sign out
          </Button>
        </Card>

        {/* Deletion */}
        <Card variant="panel" className="flex flex-col gap-sm">
          <CardTitle className="text-title-sm">Delete your account</CardTitle>
          <p className="text-body-md text-body">
            Deleting an account removes the auth record as well as your data, which has to
            happen server-side. Email{" "}
            <a
              href="mailto:support@mocknhire.app?subject=Account%20deletion%20request"
              className="text-ink underline underline-offset-4"
            >
              support@mocknhire.app
            </a>{" "}
            from this address and it will be actioned.
          </p>
        </Card>
      </Container>
    </div>
  )
}
