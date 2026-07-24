"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RotateCcw } from "lucide-react"

import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Container } from "@/components/ui/section"
import { ErrorState, LoadingState, Meter, Stat } from "@/components/ui/states"

/**
 * Interview summary.
 *
 * Two fixes beyond the restyle:
 *
 *  - This module used to call createClient() itself, creating a SECOND
 *    GoTrue client alongside lib/supabase's singleton. Two clients on one
 *    page race each other for the same refresh token and supabase-js warns
 *    about exactly this. It now uses the shared client.
 *
 *  - The report row is written asynchronously by the backend after the last
 *    answer, so it may genuinely not exist for a few seconds. The polling
 *    that handles this is kept, but bounded and with an honest message
 *    instead of an indefinite spinner.
 *
 * Presentation note: the per-question "stress" figure the backend stores is
 * a words-per-minute heuristic off the transcript -- there is no emotion
 * model behind it (see CLAUDE.md). It is therefore surfaced here as
 * *speaking pace*, private to the candidate, and never as an emotional or
 * hireability signal.
 */

const SCORE_MAX = 10
const MAX_POLLS = 10
const POLL_MS = 3000

type QuestionReport = {
  number: number
  question: string
  category: string | null
  score: number | null
  feedback: string
  paceScore: number | null
  answer: string
}

type Report = {
  overallScore: number | null
  summary: string | null
  recommendation: string | null
  duration: string
  questions: QuestionReport[]
}

function paceLabel(score: number | null): string {
  if (score == null) return "Not measured"
  // The heuristic centres on a comfortable range; both extremes read as
  // rushed or halting delivery.
  if (score > 60) return "Rushed or uneven"
  if (score > 30) return "Slightly uneven"
  return "Steady"
}

export default function SummaryClient({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<Report | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "pending" | "error">("loading")
  const pollCount = useRef(0)

  const assemble = useCallback(
    async (reportRow: Record<string, unknown>) => {
      const [{ data: questions }, { data: answers }, { data: pace }, { data: session }] =
        await Promise.all([
          supabase
            .from("mock_interview_questions")
            .select("question_number,question_text,category")
            .eq("session_id", sessionId)
            .order("question_number", { ascending: true }),
          supabase
            .from("mock_interview_answers")
            .select("question_number,answer_text,feedback,score")
            .eq("session_id", sessionId),
          supabase
            .from("mock_interview_stress_analysis")
            .select("question_number,stress_score")
            .eq("session_id", sessionId),
          supabase
            .from("mock_interview_sessions")
            .select("start_time,end_time")
            .eq("id", sessionId)
            .maybeSingle(),
        ])

      const answerMap = new Map((answers ?? []).map((a) => [a.question_number, a]))
      const paceMap = new Map((pace ?? []).map((p) => [p.question_number, p]))

      const merged: QuestionReport[] = (questions ?? []).map((q) => {
        const a = answerMap.get(q.question_number)
        const p = paceMap.get(q.question_number)
        return {
          number: q.question_number,
          question: q.question_text,
          category: q.category ?? null,
          score: typeof a?.score === "number" ? a.score : null,
          feedback: a?.feedback || "No feedback recorded for this answer.",
          paceScore: typeof p?.stress_score === "number" ? p.stress_score : null,
          answer: a?.answer_text || "",
        }
      })

      let duration = "—"
      if (session?.start_time && session?.end_time) {
        const diff = Math.max(
          0,
          (new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 1000
        )
        duration = `${Math.floor(diff / 60)}:${Math.floor(diff % 60)
          .toString()
          .padStart(2, "0")}`
      }

      setReport({
        overallScore:
          typeof reportRow.final_score === "number" ? reportRow.final_score : null,
        summary: (reportRow.overall_summary as string) ?? null,
        recommendation: (reportRow.recommendation as string) ?? null,
        duration,
        questions: merged,
      })
      setState("ready")
    },
    [sessionId]
  )

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const attempt = async () => {
      try {
        const { data: reportRow, error } = await supabase
          .from("mock_interview_reports")
          .select("*")
          .eq("session_id", sessionId)
          .maybeSingle()

        if (cancelled) return
        if (error) throw error

        if (reportRow) {
          await assemble(reportRow as Record<string, unknown>)
          return
        }

        pollCount.current += 1
        if (pollCount.current >= MAX_POLLS) {
          setState("pending")
          return
        }
        setState("loading")
        timer = setTimeout(attempt, POLL_MS)
      } catch (err) {
        if (cancelled) return
        console.error("Failed to load report:", err)
        setState("error")
      }
    }

    void attempt()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sessionId, assemble])

  if (state === "loading") {
    return (
      <div className="section-band">
        <Container>
          <LoadingState message="Scoring your answers…" />
        </Container>
      </div>
    )
  }

  if (state === "pending") {
    return (
      <div className="section-band">
        <Container>
          <ErrorState
            title="Your report is still being written"
            description="Scoring runs in the background after the last answer and is taking longer than usual. It'll be here shortly."
            action={
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RotateCcw />
                Check again
              </Button>
            }
          />
        </Container>
      </div>
    )
  }

  if (state === "error" || !report) {
    return (
      <div className="section-band">
        <Container>
          <ErrorState
            title="Couldn't load this report"
            description="There was a problem reaching the database."
            action={
              <Button variant="outline" asChild>
                <Link href="/dashboard/student">Back to dashboard</Link>
              </Button>
            }
          />
        </Container>
      </div>
    )
  }

  const answered = report.questions.filter((q) => q.score != null).length

  return (
    <div className="section-band">
      <Container className="flex flex-col gap-xl">
        <div className="flex flex-col gap-base">
          <Link
            href="/dashboard/student"
            className="inline-flex w-fit items-center gap-xs text-caption text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="flex flex-col gap-xxs">
            <span className="eyebrow">Session report</span>
            <h1 className="font-display text-display-md text-ink md:text-display-lg">
              How that interview went
            </h1>
          </div>
        </div>

        {/* Headline numbers */}
        <Card variant="panel" className="grid gap-lg sm:grid-cols-3">
          <Stat
            value={
              report.overallScore != null ? report.overallScore.toFixed(1) : "—"
            }
            label="Overall score"
            hint={`out of ${SCORE_MAX}`}
          />
          <Stat
            value={`${answered}/${report.questions.length}`}
            label="Answered"
            hint="Questions scored"
          />
          <Stat value={report.duration} label="Duration" hint="Start to finish" />
        </Card>

        {report.summary && (
          <Card variant="panel" className="flex flex-col gap-sm">
            <CardTitle>Summary</CardTitle>
            <p className="text-body-md text-body">{report.summary}</p>
            {report.recommendation && (
              <>
                <CardTitle className="mt-sm text-title-sm">What to work on</CardTitle>
                <p className="text-body-md text-body">{report.recommendation}</p>
              </>
            )}
          </Card>
        )}

        {/* Per question */}
        <div className="flex flex-col gap-base">
          <h2 className="font-display text-display-sm text-ink">Question by question</h2>
          {report.questions.map((q) => (
            <Card key={q.number} variant="panel" className="flex flex-col gap-base">
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div className="flex flex-col gap-xxs">
                  <span className="eyebrow">Question {q.number}</span>
                  <CardTitle>{q.question}</CardTitle>
                </div>
                {q.category && <Badge variant="outline">{q.category}</Badge>}
              </div>

              {q.score != null && (
                <Meter
                  label="Answer score"
                  value={q.score}
                  max={SCORE_MAX}
                  valueLabel={`${q.score}/${SCORE_MAX}`}
                />
              )}

              <div className="flex flex-col gap-xs">
                <span className="text-body-strong text-ink">Feedback</span>
                <p className="text-body-md text-body">{q.feedback}</p>
              </div>

              {q.answer && (
                <details className="group">
                  <summary className="cursor-pointer text-caption text-muted transition-colors hover:text-ink">
                    Show your transcribed answer
                  </summary>
                  <p className="mt-sm rounded-lg bg-canvas-soft p-base text-body-sm text-body">
                    {q.answer}
                  </p>
                </details>
              )}

              <div className="flex items-center justify-between gap-sm border-t border-hairline pt-sm">
                <span className="text-caption text-muted">
                  Speaking pace &middot; {paceLabel(q.paceScore)}
                </span>
              </div>
            </Card>
          ))}
        </div>

        <p className="text-caption text-muted">
          Speaking pace is measured from your transcript&rsquo;s words per minute. It is a
          delivery cue for your own practice only &mdash; it is not an emotion or
          confidence measurement, and it is never shown to recruiters.
        </p>

        <div className="flex flex-wrap gap-sm">
          <Button asChild>
            <Link href="/dashboard/student">Practise again</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/session-history">All sessions</Link>
          </Button>
        </div>
      </Container>
    </div>
  )
}
