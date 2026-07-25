"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react"

import { APIStudent } from "@/lib/apiStudent"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Container } from "@/components/ui/section"
import { ErrorState, LoadingState, Meter, Stat } from "@/components/ui/states"

/**
 * Interview summary.
 *
 * GET /interview/sessions/{id}/report computes the report synchronously
 * (difficulty-weighted score, LLM summary/recommendation, per-question
 * rubric) and returns it directly -- unlike the old fixed-list flow, there
 * is no separate "kick off report generation" call and no polling for a row
 * to appear. See INTERVIEW_ARCHITECTURE.md section 8 for the scoring model
 * and student/core/report_service.py for what's actually computed.
 *
 * Speaking pace (average_pace_wpm/pace_label) is a delivery cue only -- it
 * is never part of final_score, and is never shown as an emotional or
 * hireability signal (see CLAUDE.md).
 */

const SCORE_MAX = 10

type Rubric = {
  relevance: number
  specificity: number
  depth: number
  structure: number
  score: number
  evidence_quotes: string[]
  gaps: string[]
  feedback: string
} | null

type Provenance = {
  source_count: number
  date_range: string[]
  theme: string
} | null

type QuestionReport = {
  question_number: number
  question_text: string
  phase: string
  difficulty_tier: number | null
  is_followup: boolean
  provenance: Provenance
  answer_text: string | null
  score: number | null
  rubric: Rubric
  feedback: string | null
}

type Report = {
  target_role: string | null
  company: string | null
  questions: QuestionReport[]
  average_pace_wpm: number | null
  pace_label: string
  overall_summary: string
  final_score: number | null
  recommendation: string
}

export default function SummaryClient({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<Report | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState("loading")
      try {
        const res = await APIStudent(`/interview/sessions/${sessionId}/report`, { method: "GET" })
        if (!res.ok) throw new Error(await res.text())
        const data = (await res.json()) as Report
        if (cancelled) return
        setReport(data)
        setState("ready")
      } catch (err) {
        if (cancelled) return
        console.error("Failed to load report:", err)
        setState("error")
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (state === "loading") {
    return (
      <div className="section-band">
        <Container>
          <LoadingState message="Scoring your answers…" />
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
            description="There was a problem reaching the server."
            action={
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RotateCcw />
                Try again
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
              {report.target_role ? `${report.target_role} interview` : "How that interview went"}
              {report.company ? ` · ${report.company}` : ""}
            </h1>
          </div>
        </div>

        {/* Headline numbers */}
        <Card variant="panel" className="grid gap-lg sm:grid-cols-3">
          <Stat
            value={report.final_score != null ? report.final_score.toFixed(1) : "—"}
            label="Overall score"
            hint={`out of ${SCORE_MAX}, difficulty-weighted`}
          />
          <Stat
            value={`${answered}/${report.questions.length}`}
            label="Answered"
            hint="Questions scored"
          />
          <Stat
            value={report.average_pace_wpm != null ? Math.round(report.average_pace_wpm).toString() : "—"}
            label="Speaking pace"
            hint={report.pace_label}
          />
        </Card>

        {report.overall_summary && (
          <Card variant="panel" className="flex flex-col gap-sm">
            <CardTitle>Summary</CardTitle>
            <p className="text-body-md text-body">{report.overall_summary}</p>
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
            <Card key={q.question_number} variant="panel" className="flex flex-col gap-base">
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div className="flex flex-col gap-xxs">
                  <span className="eyebrow">Question {q.question_number}</span>
                  <CardTitle>{q.question_text}</CardTitle>
                </div>
                <div className="flex flex-wrap items-center gap-xs">
                  {q.is_followup && <Badge variant="outline">Follow-up</Badge>}
                  {q.provenance && q.provenance.source_count > 0 && (
                    <Badge variant="default" className="gap-xxs">
                      <Sparkles className="h-3 w-3" />
                      Company-style
                    </Badge>
                  )}
                  <Badge variant="outline">{q.phase}</Badge>
                </div>
              </div>

              {q.score != null && (
                <Meter
                  label="Answer score"
                  value={q.score}
                  max={SCORE_MAX}
                  valueLabel={`${q.score}/${SCORE_MAX}`}
                />
              )}

              {q.rubric && (q.rubric.evidence_quotes?.length > 0 || q.rubric.gaps?.length > 0) && (
                <div className="grid gap-sm sm:grid-cols-2">
                  {q.rubric.evidence_quotes?.length > 0 && (
                    <div className="flex flex-col gap-xs">
                      <span className="text-caption text-muted">What stood out</span>
                      <ul className="flex flex-col gap-xxs">
                        {q.rubric.evidence_quotes.map((quote, i) => (
                          <li key={i} className="text-body-sm text-body">
                            &ldquo;{quote}&rdquo;
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {q.rubric.gaps?.length > 0 && (
                    <div className="flex flex-col gap-xs">
                      <span className="text-caption text-muted">Gaps</span>
                      <ul className="flex flex-col gap-xxs">
                        {q.rubric.gaps.map((gap, i) => (
                          <li key={i} className="text-body-sm text-body">
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-xs">
                <span className="text-body-strong text-ink">Feedback</span>
                <p className="text-body-md text-body">
                  {q.feedback || "No feedback recorded for this answer."}
                </p>
              </div>

              {q.answer_text && (
                <details className="group">
                  <summary className="cursor-pointer text-caption text-muted transition-colors hover:text-ink">
                    Show your transcribed answer
                  </summary>
                  <p className="mt-sm rounded-lg bg-canvas-soft p-base text-body-sm text-body">
                    {q.answer_text}
                  </p>
                </details>
              )}
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
