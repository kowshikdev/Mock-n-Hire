"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Mic, Search } from "lucide-react"

import { supabase } from "@/lib/supabase"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Container } from "@/components/ui/section"
import { EmptyState, ErrorState, LoadingState, Stat } from "@/components/ui/states"

/**
 * Session history.
 *
 * This page previously rendered a `mockSessions` array of six invented
 * sessions -- hardcoded roles, scores and dates -- with no backend call
 * anywhere in the file. Every user saw the same six fabricated results,
 * including users who had never run a session. It now reads the real
 * `mock_interview_sessions` rows for the signed-in user (scoped by RLS)
 * and has a genuine empty state.
 */

type SessionRow = {
  id: string
  start_time: string | null
  end_time: string | null
  status: string | null
  overall_score: number | null
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

export default function SessionHistoryPage() {
  const { user } = useAppStore()
  const userId = user?.id

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    if (!userId) return
    setState("loading")
    try {
      const { data, error } = await supabase
        .from("mock_interview_sessions")
        .select("id,start_time,end_time,status,overall_score")
        .eq("user_id", userId)
        .order("start_time", { ascending: false })

      if (error) throw error
      setSessions((data ?? []) as SessionRow[])
      setState("ready")
    } catch (err) {
      console.error("Failed to load session history:", err)
      setState("error")
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions
    const q = query.trim().toLowerCase()
    return sessions.filter((s) => {
      const date = s.start_time ? dateFmt.format(new Date(s.start_time)).toLowerCase() : ""
      return date.includes(q) || (s.status ?? "").toLowerCase().includes(q)
    })
  }, [sessions, query])

  /*
   * Aggregates are computed only from sessions that actually carry a score.
   * Treating an unscored session as 0 would drag the average down and
   * misreport the user's own history back to them.
   */
  const scored = sessions.filter((s) => typeof s.overall_score === "number")
  const averageScore =
    scored.length > 0
      ? scored.reduce((sum, s) => sum + (s.overall_score as number), 0) / scored.length
      : null
  const bestScore =
    scored.length > 0 ? Math.max(...scored.map((s) => s.overall_score as number)) : null

  return (
    <div className="section-band">
      <Container className="flex flex-col gap-xl">
        <div className="flex flex-col gap-xs">
          <span className="eyebrow">History</span>
          <h1 className="font-display text-display-md text-ink md:text-display-lg">
            Your practice sessions
          </h1>
          <p className="text-body-md text-body">
            Every interview you&rsquo;ve run, with the report attached.
          </p>
        </div>

        {state === "loading" && <LoadingState message="Loading your history…" />}

        {state === "error" && (
          <ErrorState
            title="Couldn't load your history"
            description="There was a problem reaching the database."
            action={
              <Button variant="outline" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        )}

        {state === "ready" && sessions.length === 0 && (
          <EmptyState
            icon={<Mic />}
            title="No sessions yet"
            description="Once you run a practice interview it'll show up here, along with its report."
            action={
              <Button asChild>
                <Link href="/dashboard/student">Start your first interview</Link>
              </Button>
            }
          />
        )}

        {state === "ready" && sessions.length > 0 && (
          <>
            <Card variant="panel" className="grid gap-lg sm:grid-cols-3">
              <Stat value={sessions.length} label="Sessions" hint="Interviews run" />
              <Stat
                value={averageScore != null ? averageScore.toFixed(1) : "—"}
                label="Average score"
                hint={scored.length > 0 ? `Across ${scored.length} scored` : "None scored yet"}
              />
              <Stat
                value={bestScore != null ? bestScore.toFixed(1) : "—"}
                label="Best score"
                hint="Highest so far"
              />
            </Card>

            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by date or status"
                className="pl-9"
                aria-label="Filter sessions"
              />
            </div>

            {filtered.length === 0 ? (
              <p className="text-body-md text-muted">No sessions match that filter.</p>
            ) : (
              <ul className="flex flex-col gap-sm">
                {filtered.map((s) => {
                  const complete = s.status?.toLowerCase() === "completed"
                  return (
                    <li key={s.id}>
                      <Card
                        variant="feature"
                        interactive
                        className="flex flex-wrap items-center justify-between gap-base"
                      >
                        <div className="flex flex-col gap-xxs">
                          <CardTitle className="text-title-sm">
                            {s.start_time
                              ? dateFmt.format(new Date(s.start_time))
                              : "Practice session"}
                          </CardTitle>
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
          </>
        )}
      </Container>
    </div>
  )
}
