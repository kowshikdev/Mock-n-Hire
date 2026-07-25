"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Meter, Spinner } from "@/components/ui/states"
import { Wordmark } from "@/components/layout/wordmark"
import { Mic, MicOff, Video, VideoOff, Sparkles, Check } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { toast } from "sonner"
import { APIStudent } from "@/lib/apiStudent"
import { useAppStore } from "@/lib/store"
import { speakWithBrowser, cancelBrowserSpeech } from "@/lib/speech"
import { createVoiceTurnDetector } from "@/lib/vad"

const validateSessionId = (sessionId: any): string => {
  if (typeof sessionId !== "string" || !sessionId.match(/^[\w-]{36}$/)) {
    throw new Error("Session ID is invalid or missing.")
  }
  return sessionId
}

const PHASE_LABELS: Record<string, string> = {
  warmup: "Warm-up",
  technical: "Technical",
  behavioral: "Behavioral",
  situational: "Situational",
  closing: "Closing",
}

type Provenance = {
  source_count: number
  date_range: string[]
  theme: string
} | null

type Question = {
  question_id: string
  question_number: number
  question_text: string
  phase: string
  is_followup: boolean
  provenance: Provenance
}

/** What the interview is doing right now. Drives the whole UI. */
type Stage = "loading" | "ready" | "speaking" | "listening" | "thinking" | "done"

/*
 * A conversation, not a form.
 *
 * The previous version was a quiz: press "Start recording", watch a
 * per-question countdown, press "Submit answer", wait, read the next
 * question. None of that is how an interview works, and the countdown in
 * particular actively harmed the thing being practised -- nobody rehearses
 * for a real interview by watching a clock tick toward a hard cutoff.
 *
 * Now the interviewer asks out loud, listens until you stop talking, and
 * asks the next thing. There is exactly one button in the entire session
 * ("I'm ready"), and it exists for a technical reason rather than a design
 * one: browsers refuse to play audio without a user gesture, and arriving
 * here is a navigation rather than a click. That single press unlocks audio
 * for the rest of the session.
 *
 * The session still has a time budget -- it is what sizes the interview --
 * but the candidate sees one progress bar rather than a per-question
 * countdown, and the budget is spent, never enforced mid-answer.
 */
export default function InterviewPageClient({ sessionIdParam }: { sessionIdParam: string }) {
  const [question, setQuestion] = useState<Question | null>(null)
  const [stage, setStage] = useState<Stage>("loading")
  const [progress, setProgress] = useState(0)
  const [level, setLevel] = useState(0)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [micDenied, setMicDenied] = useState(false)
  const { user } = useAppStore()
  const router = useRouter()

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const detectorRef = useRef<ReturnType<typeof createVoiceTurnDetector> | null>(null)
  // The turn currently in flight. Guards against the detector firing twice
  // (silence can re-trigger while the upload is still running) and against a
  // late detector callback landing after the session has already ended.
  const submittingRef = useRef(false)
  const sessionId = useRef<string>("")

  try {
    sessionId.current = validateSessionId(sessionIdParam)
  } catch {
    // Surfaced by the load effect below rather than thrown during render.
  }

  /* ---------------------------------------------------------------- */
  /* Media                                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false
    async function initMedia() {
      try {
        // Video is requested for the preview only -- it is never recorded
        // and never uploaded. Nothing reads it, and the emotion-inference
        // feature that would have is prohibited in a hiring context (EU AI
        // Act Art. 5(1)(f)). Practising on camera is still worth something,
        // so the preview stays; the upload does not.
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (e) {
        console.error("Media access denied.", e)
        // Audio-only is a usable interview; video-only is not.
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true })
          if (cancelled) {
            audioOnly.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = audioOnly
          setVideoEnabled(false)
          toast("Camera unavailable — continuing with audio only.")
        } catch {
          if (!cancelled) {
            setMicDenied(true)
            toast.error("Microphone access is required for a spoken interview.")
          }
        }
      }
    }
    void initMedia()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      detectorRef.current?.stop()
      cancelBrowserSpeech()
      audioElRef.current?.pause()
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /* Load the open question                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false
    async function loadState() {
      if (!user?.id) {
        toast.error("Please sign in to continue.")
        router.push("/auth/login")
        return
      }
      try {
        const res = await APIStudent(`/interview/sessions/${sessionId.current}/state`, { method: "GET" })
        if (!res.ok) {
          toast.error("Session not found. Please start a new interview.")
          setTimeout(() => router.push("/dashboard/student"), 2500)
          return
        }
        const data = await res.json()
        if (cancelled) return

        if (data.status !== "in_progress" || !data.question_id) {
          router.push(`/interview/${sessionId.current}/summary`)
          return
        }
        setQuestion(toQuestion(data))
        setProgress(data.progress ?? 0)
        setStage("ready")
      } catch (err) {
        if (cancelled) return
        console.error("Failed to load interview state:", err)
        toast.error("Couldn't load your interview. Please try again.")
      }
    }
    void loadState()
    return () => {
      cancelled = true
    }
  }, [sessionIdParam, user?.id, router])

  /* ---------------------------------------------------------------- */
  /* Ask (speak) -> listen -> submit -> ask again                      */
  /* ---------------------------------------------------------------- */

  const submitTurn = useCallback(async (audio: Blob | null) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setStage("thinking")
    setLevel(0)

    try {
      const body = new FormData()
      // An empty blob is meaningfully different from no blob: the backend
      // treats a turn with no audio as "nothing was said", which is a valid
      // outcome, not an error.
      if (audio && audio.size > 0) body.append("audio", audio, "answer.webm")

      const res = await APIStudent(`/interview/sessions/${sessionId.current}/turn`, {
        method: "POST",
        body,
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()

      setProgress(data.progress ?? 0)

      if (data.done || !data.next) {
        setStage("done")
        toast.success("That's everything — putting your report together.")
        setTimeout(() => router.push(`/interview/${sessionId.current}/summary`), 1400)
        return
      }
      setQuestion(toQuestion(data.next))
      submittingRef.current = false
      void ask(toQuestion(data.next))
    } catch (e) {
      console.error("Turn failed:", e)
      toast.error("Couldn't send that answer. Retrying in a moment…")
      submittingRef.current = false
      // Listen again rather than stranding the candidate on a dead screen.
      setTimeout(() => void listen(), 1500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  /** Start recording and hand control to the turn detector. */
  const listen = useCallback(async () => {
    const stream = streamRef.current
    if (!stream) return
    setStage("listening")

    chunksRef.current = []
    const audioStream = new MediaStream(stream.getAudioTracks())
    const recorder = new MediaRecorder(audioStream, { mimeType: "audio/webm" })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorderRef.current = recorder
    recorder.start()

    detectorRef.current?.stop()
    detectorRef.current = createVoiceTurnDetector(audioStream, {
      onLevel: setLevel,
      onTurnEnd: (spoke) => {
        detectorRef.current?.stop()
        const rec = recorderRef.current
        if (!rec || rec.state !== "recording") {
          void submitTurn(spoke ? new Blob(chunksRef.current, { type: "audio/webm" }) : null)
          return
        }
        rec.onstop = () => {
          const blob = spoke ? new Blob(chunksRef.current, { type: "audio/webm" }) : null
          chunksRef.current = []
          void submitTurn(blob)
        }
        rec.stop()
      },
    })
    detectorRef.current.start()
  }, [submitTurn])

  /** Say the question aloud, then start listening. */
  const ask = useCallback(
    async (q: Question) => {
      setStage("speaking")
      try {
        const res = await APIStudent(
          `/interview/sessions/${sessionId.current}/questions/${q.question_id}/audio`,
          { method: "GET" },
        )
        if (res.ok && res.status !== 204) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const el = audioElRef.current ?? new Audio()
          audioElRef.current = el
          el.src = url
          await new Promise<void>((resolve) => {
            el.onended = () => resolve()
            el.onerror = () => resolve()
            el.play().catch(() => resolve())
          })
          URL.revokeObjectURL(url)
        } else {
          // 204 means the server has no voice for this question. The
          // browser's own is worse but instant, and a question the
          // candidate can hear beats one they only read.
          await speakWithBrowser(q.question_text)
        }
      } catch {
        await speakWithBrowser(q.question_text)
      }
      await listen()
    },
    [listen],
  )

  const begin = useCallback(() => {
    if (!question) return
    void ask(question)
  }, [ask, question])

  /* ---------------------------------------------------------------- */

  const toggleVideo = () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !videoEnabled
    setVideoEnabled(!videoEnabled)
  }

  if (stage === "loading" || !question) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 border-hairline-strong border-t-ink" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-hairline bg-canvas">
        <div className="container-content flex h-16 items-center justify-between gap-base">
          <Wordmark />
          <StatusPill stage={stage} level={level} />
        </div>
      </header>

      <div className="container-content py-xl">
        <div className="mx-auto flex max-w-5xl flex-col gap-base">
          <div className="flex flex-col gap-xs">
            <div className="flex items-baseline justify-between gap-sm">
              <span className="eyebrow">{PHASE_LABELS[question.phase] ?? question.phase}</span>
              <div className="flex items-center gap-xs">
                {question.is_followup && <Badge variant="outline">Follow-up</Badge>}
                {question.provenance && question.provenance.source_count > 0 && (
                  <Badge variant="default" className="gap-xxs">
                    <Sparkles className="h-3 w-3" />
                    Company-style
                  </Badge>
                )}
              </div>
            </div>
            <Meter value={progress * 100} ariaLabel="Interview progress" />
          </div>

          <div className="grid gap-base lg:grid-cols-3">
            <Card variant="panel" className="flex flex-col gap-base lg:col-span-1">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-dark">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`h-full w-full object-cover ${!videoEnabled ? "opacity-0" : ""}`}
                />
                {!videoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <VideoOff className="h-8 w-8 text-on-dark-soft" />
                  </div>
                )}
              </div>
              <div className="flex justify-center">
                <Button
                  variant={videoEnabled ? "outline" : "destructive"}
                  size="icon"
                  onClick={toggleVideo}
                  aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
                  aria-pressed={!videoEnabled}
                >
                  {videoEnabled ? <Video /> : <VideoOff />}
                </Button>
              </div>
              <p className="text-caption text-muted">
                Your camera is for you — nothing from it is recorded or uploaded.
              </p>
            </Card>

            <Card variant="panel" className="flex flex-col gap-lg lg:col-span-2">
              <h1
                className="font-display text-display-sm text-ink md:text-display-md"
                aria-live="polite"
              >
                {question.question_text}
              </h1>
              {question.provenance && question.provenance.source_count > 0 && (
                <p className="text-caption text-muted">
                  Derived from {question.provenance.source_count} real interview report
                  {question.provenance.source_count === 1 ? "" : "s"}
                  {question.provenance.date_range?.length === 2
                    ? `, ${question.provenance.date_range[0]} – ${question.provenance.date_range[1]}`
                    : ""}
                  .
                </p>
              )}

              <div className="mt-auto">
                {stage === "ready" ? (
                  <div className="flex flex-col gap-base">
                    <p className="text-body-md text-body">
                      This runs like a real conversation. You&rsquo;ll hear each question,
                      answer out loud, and it moves on when you stop talking — no timers,
                      nothing to click.
                    </p>
                    <Button size="lg" onClick={begin} disabled={micDenied}>
                      <Mic />
                      I&rsquo;m ready
                    </Button>
                    {micDenied && (
                      <p className="text-caption text-error">
                        Enable microphone access in your browser, then reload this page.
                      </p>
                    )}
                  </div>
                ) : (
                  <StageHint stage={stage} />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function toQuestion(data: any): Question {
  return {
    question_id: data.question_id,
    question_number: data.question_number,
    question_text: data.question ?? data.question_text,
    phase: data.phase,
    is_followup: !!data.is_followup,
    provenance: data.provenance ?? null,
  }
}

/** Replaces the countdown: says what the interview is doing, not how long is left. */
function StatusPill({ stage, level }: { stage: Stage; level: number }) {
  if (stage === "listening") {
    return (
      <span className="flex items-center gap-xs text-caption text-ink">
        <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-[3px] rounded-pill bg-ink transition-[height] duration-100"
              style={{ height: `${Math.max(4, Math.min(16, level * 40 + (i === 1 ? 4 : 0)))}px` }}
            />
          ))}
        </span>
        Listening
      </span>
    )
  }
  const labels: Partial<Record<Stage, string>> = {
    speaking: "Interviewer speaking",
    thinking: "Thinking…",
    done: "Finished",
    ready: "Ready when you are",
  }
  return <span className="text-caption text-muted">{labels[stage] ?? ""}</span>
}

function StageHint({ stage }: { stage: Stage }) {
  if (stage === "speaking") {
    return <p className="text-body-md text-body">Listen to the question…</p>
  }
  if (stage === "listening") {
    return (
      <p className="text-body-md text-body">
        Answer out loud. Pause when you&rsquo;re finished and the interviewer will
        pick it up from there.
      </p>
    )
  }
  if (stage === "thinking") {
    return (
      <p className="flex items-center gap-sm text-body-md text-body">
        <Spinner className="h-4 w-4 border-hairline-strong border-t-ink" />
        Considering your answer…
      </p>
    )
  }
  return (
    <p className="flex items-center gap-sm text-body-md text-body">
      <Check className="h-4 w-4" />
      Interview complete.
    </p>
  )
}
