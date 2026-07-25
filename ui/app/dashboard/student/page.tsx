"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Mic } from "lucide-react"
import { toast } from "sonner"

import { APIStudent } from "@/lib/apiStudent"
import { supabase } from "@/lib/supabase"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Field, Input, Textarea } from "@/components/ui/input"
import { Container } from "@/components/ui/section"
import { EmptyState, LoadingState, Spinner } from "@/components/ui/states"
import { OrbField } from "@/components/ui/orb"
import { ResumeLibrary } from "@/components/interview/resume-library"

// 15/30/45 min, per INTERVIEW_ARCHITECTURE.md: a recruiter screen, a
// standard technical round, a full loop stage.
const DURATION_OPTIONS = [
  { minutes: 15, label: "15 min", hint: "Quick screen" },
  { minutes: 30, label: "30 min", hint: "Standard round" },
  { minutes: 45, label: "45 min", hint: "Full loop" },
]

type SessionRow = {
  id: string
  start_time: string | null
  status: string | null
  target_role: string | null
  company: string | null
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

export default function StudentDashboard() {
  const router = useRouter()
  const { user } = useAppStore()
  const userId = user?.id

  const [resumeId, setResumeId] = useState<string | null>(null)
  const [targetRole, setTargetRole] = useState("")
  const [company, setCompany] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [isGenerating, setIsGenerating] = useState(false)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsState, setSessionsState] = useState<"loading" | "ready" | "error">("loading")

  /*
   * Recent sessions come straight from Supabase, scoped to this user by RLS.
   *
   * The previous dashboard called APIStudent("/admin/sessions") -- the
   * recruiter-only admin route, guarded by require_recruiter. Every student
   * hitting this page got a 403 and a "Failed to fetch sessions" toast, so
   * the section never rendered a single row for the users it was built for.
   */
  const loadSessions = useCallback(async () => {
    if (!userId) return
    setSessionsState("loading")
    try {
      const { data, error } = await supabase
        .from("mock_interview_sessions")
        .select("id,start_time,status,target_role,company")
        .eq("user_id", userId)
        .order("start_time", { ascending: false })
        .limit(5)

      if (error) throw error
      setSessions((data ?? []) as SessionRow[])
      setSessionsState("ready")
    } catch (err) {
      console.error("Failed to load sessions:", err)
      setSessionsState("error")
    }
  }, [userId])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const handleGenerate = async () => {
    if (!resumeId) {
      toast.error("Add a resume first.")
      return
    }
    if (!targetRole.trim()) {
      toast.error("What role are you practising for?")
      return
    }
    if (!userId) {
      toast.error("You need to be signed in.")
      return
    }

    setIsGenerating(true)
    try {
      // The resume is already uploaded and, by now, already parsed -- the
      // library handles that, so this is one call rather than upload-then-
      // create. Session creation itself makes no LLM call: it returns a
      // fixed opening question immediately and researches in the background.
      const sessionRes = await APIStudent("/interview/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_id: resumeId,
          target_role: targetRole.trim(),
          company: company.trim() || null,
          job_description: jobDescription.trim() || null,
          duration_minutes: durationMinutes,
        }),
      })
      if (!sessionRes.ok) {
        const detail = await sessionRes.text()
        throw new Error(detail || "Failed to create session")
      }
      const { session_id: sessionId } = await sessionRes.json()

      router.push(`/interview/${sessionId}`)
    } catch (err) {
      console.error("Interview generation failed:", err)
      toast.error("Couldn't build your interview. Please try again.")
      setIsGenerating(false)
    }
  }

  return (
    <div className="section-band relative overflow-hidden">
      <OrbField variant="corner" />
      <Container className="flex flex-col gap-xl">
        {/* Header */}
        <div className="flex flex-col gap-xs">
          <span className="eyebrow">Candidate</span>
          <h1 className="font-display text-display-md text-ink md:text-display-lg">
            {user?.name ? `Hello, ${user.name.split(" ")[0]}` : "Practise an interview"}
          </h1>
          <p className="max-w-2xl text-body-md text-body">
            Upload your resume and Mock&rsquo;n-Hire will build a spoken interview from what
            is actually on it, then score every answer.
          </p>
        </div>

        {/* Start a session */}
        <Card variant="panel" className="flex flex-col gap-base">
          <CardTitle>Start a new session</CardTitle>

          <Field label="Resume" hint="Kept between sessions — pick one or add another">
            <ResumeLibrary
              userId={userId}
              selectedId={resumeId}
              onSelect={setResumeId}
              disabled={isGenerating}
            />
          </Field>

          <div className="grid gap-base sm:grid-cols-2">
            <Field label="Target role" htmlFor="target-role">
              <Input
                id="target-role"
                placeholder="e.g. Backend Engineer"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                disabled={isGenerating}
              />
            </Field>
            <Field label="Company" hint="Optional -- grounds technical questions in real research">
              <Input
                placeholder="e.g. Stripe"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={isGenerating}
              />
            </Field>
          </div>

          <Field
            label="Job description"
            hint="Optional, but the single best thing you can add -- a posting names the stack a role title only implies"
          >
            <Textarea
              placeholder="Paste the job posting here…"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              disabled={isGenerating}
              rows={5}
            />
          </Field>

          <Field label="Duration">
            <div className="flex flex-wrap gap-sm" role="radiogroup" aria-label="Interview duration">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  role="radio"
                  aria-checked={durationMinutes === opt.minutes}
                  onClick={() => setDurationMinutes(opt.minutes)}
                  disabled={isGenerating}
                  className={cn(
                    "flex flex-col items-start gap-xxs rounded-lg border px-base py-sm text-left transition-colors disabled:opacity-50",
                    durationMinutes === opt.minutes
                      ? "border-ink bg-surface-strong"
                      : "border-hairline-strong hover:border-ink"
                  )}
                >
                  <span className="text-body-strong text-ink">{opt.label}</span>
                  <span className="text-caption text-muted">{opt.hint}</span>
                </button>
              ))}
            </div>
          </Field>

          <div className="flex flex-wrap items-center gap-base">
            <Button onClick={handleGenerate} disabled={!resumeId || isGenerating}>
              {isGenerating ? (
                <>
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                  Building your interview…
                </>
              ) : (
                <>
                  <Mic />
                  Start interview
                </>
              )}
            </Button>
            <span className="text-caption text-muted">
              You&rsquo;ll answer out loud, so check your microphone first.
            </span>
          </div>
        </Card>

        {/* Recent sessions */}
        <div className="flex flex-col gap-base">
          <div className="flex items-end justify-between gap-base">
            <h2 className="font-display text-display-sm text-ink">Recent sessions</h2>
            {sessions.length > 0 && (
              <Button variant="text" asChild>
                <Link href="/session-history">View all</Link>
              </Button>
            )}
          </div>

          {sessionsState === "loading" && <LoadingState message="Loading your sessions…" />}

          {sessionsState === "error" && (
            <Card variant="feature" className="flex items-center justify-between gap-base">
              <p className="text-body-md text-body">Couldn&rsquo;t load your sessions.</p>
              <Button variant="outline" size="sm" onClick={() => void loadSessions()}>
                Retry
              </Button>
            </Card>
          )}

          {sessionsState === "ready" && sessions.length === 0 && (
            <EmptyState
              icon={<Mic />}
              title="No sessions yet"
              description="Upload your resume above to run your first practice interview."
            />
          )}

          {sessionsState === "ready" && sessions.length > 0 && (
            <ul className="flex flex-col gap-sm">
              {sessions.map((s) => {
                const complete = s.status?.toLowerCase() === "completed"
                return (
                  <li key={s.id}>
                    <Card
                      variant="feature"
                      interactive
                      className="flex flex-wrap items-center justify-between gap-base"
                    >
                      <div className="flex flex-col gap-xxs">
                        <span className="text-body-strong text-ink">
                          {s.target_role || "Practice session"}
                          {s.company ? ` · ${s.company}` : ""}
                        </span>
                        <span className="text-caption text-muted">
                          {s.start_time ? dateFmt.format(new Date(s.start_time)) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-base">
                        <Badge variant={complete ? "success" : "pending"}>
                          {s.status ?? "in progress"}
                        </Badge>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/interview/${s.id}/summary`}>
                            Report
                            <ArrowRight />
                          </Link>
                        </Button>
                      </div>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Container>
    </div>
  )
}
