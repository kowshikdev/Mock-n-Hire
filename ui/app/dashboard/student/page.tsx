"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useDropzone } from "react-dropzone"
import { ArrowRight, FileText, Mic, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { APIStudent } from "@/lib/apiStudent"
import { supabase } from "@/lib/supabase"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Container } from "@/components/ui/section"
import { EmptyState, LoadingState, Spinner } from "@/components/ui/states"
import { OrbField } from "@/components/ui/orb"

const MAX_RESUME_BYTES = 10 * 1024 * 1024 // 10 MB

type SessionRow = {
  id: string
  start_time: string | null
  status: string | null
  overall_score: number | null
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

  const [resumeFile, setResumeFile] = useState<File | null>(null)
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
        .select("id,start_time,status,overall_score")
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

  const onDrop = useCallback((accepted: File[], rejected: unknown[]) => {
    if (rejected.length > 0) {
      toast.error("Please upload a PDF.")
      return
    }
    const file = accepted[0]
    if (!file) return
    if (file.size > MAX_RESUME_BYTES) {
      toast.error("That file is over 10 MB.")
      return
    }
    setResumeFile(file)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // The backend rejects anything that isn't a PDF
    // (interview.py: "Only PDF files are supported"), so DOC/DOCX are not
    // offered here -- accepting them only to fail server-side wasted the
    // user's upload.
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: isGenerating,
  })

  const handleGenerate = async () => {
    if (!resumeFile) {
      toast.error("Upload your resume first.")
      return
    }
    if (!userId) {
      toast.error("You need to be signed in.")
      return
    }

    setIsGenerating(true)
    try {
      const formData = new FormData()
      formData.append("file", resumeFile)

      const uploadRes = await APIStudent(`/interview/upload-resume/${userId}`, {
        method: "POST",
        body: formData,
      })
      if (!uploadRes.ok) {
        const detail = await uploadRes.text()
        throw new Error(detail || "Failed to upload resume")
      }
      const { resume_id: resumeId } = await uploadRes.json()

      const genRes = await APIStudent(
        `/interview/generate-questions/${userId}/${resumeId}`,
        { method: "POST" }
      )
      if (!genRes.ok) {
        const detail = await genRes.text()
        throw new Error(detail || "Failed to generate questions")
      }
      const { session_id: sessionId } = await genRes.json()

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

          {resumeFile ? (
            <div className="flex items-center justify-between gap-base rounded-lg border border-hairline-strong bg-canvas-soft p-base">
              <div className="flex min-w-0 items-center gap-sm">
                <FileText className="size-5 shrink-0 text-ink" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-body-strong text-ink">
                    {resumeFile.name}
                  </span>
                  <span className="text-caption text-muted">
                    {(resumeFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResumeFile(null)}
                disabled={isGenerating}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-xs rounded-lg border border-dashed p-xl text-center transition-colors",
                isDragActive
                  ? "border-ink bg-surface-strong"
                  : "border-hairline-strong hover:border-ink",
                isGenerating && "pointer-events-none opacity-60"
              )}
            >
              <input {...getInputProps()} />
              <UploadCloud className="size-6 text-muted" />
              <span className="text-body-strong text-ink">
                {isDragActive ? "Drop your resume here" : "Drop your resume"}
              </span>
              <span className="text-caption text-muted">PDF, up to 10 MB</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-base">
            <Button onClick={handleGenerate} disabled={!resumeFile || isGenerating}>
              {isGenerating ? (
                <>
                  <Spinner className="size-4 border-white/40 border-t-white" />
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
                          {s.start_time
                            ? dateFmt.format(new Date(s.start_time))
                            : "Practice session"}
                        </span>
                        <span className="text-caption text-muted">
                          {s.overall_score != null
                            ? `Score ${Number(s.overall_score).toFixed(1)}`
                            : "Not scored"}
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
