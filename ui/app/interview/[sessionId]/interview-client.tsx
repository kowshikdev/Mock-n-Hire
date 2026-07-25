"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Meter, Spinner } from "@/components/ui/states"
import { Wordmark } from "@/components/layout/wordmark"
import { Mic, MicOff, Video, VideoOff, SkipForward, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { APIStudent } from "@/lib/apiStudent"
import { useAppStore } from "@/lib/store"
import { supabase } from "@/lib/supabase"

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
  time_budget_seconds: number
  is_followup: boolean
  provenance: Provenance
}

/*
 * The interview is duration-driven, not a fixed list of nine questions --
 * see INTERVIEW_ARCHITECTURE.md. Each turn is one round trip:
 * POST /sessions/{id}/answer uploads nothing itself (the recording already
 * went to storage) and returns the evaluation plus whatever comes next,
 * so there is no separate "fetch the next question" call the way the old
 * fixed-list flow needed.
 */
export default function InterviewPageClient({ sessionIdParam }: { sessionIdParam: string }) {
  const [question, setQuestion] = useState<Question | null>(null)
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState(120)
  const [isRecording, setIsRecording] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [isAnswering, setIsAnswering] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const { user } = useAppStore()
  const mockUserId = user?.id
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const videoChunksRef = useRef<Blob[]>([])
  const audioChunksRef = useRef<Blob[]>([])

  // 1. Load the current open question for this session.
  useEffect(() => {
    let cancelled = false

    async function loadState() {
      if (!mockUserId) {
        toast.error("Please sign in to continue.")
        router.push("/auth/login")
        return
      }
      try {
        const sessionId = validateSessionId(sessionIdParam)
        const res = await APIStudent(`/interview/sessions/${sessionId}/state`, { method: "GET" })
        if (!res.ok) {
          toast.error("Session not found. Please start a new interview.")
          setTimeout(() => router.push("/dashboard/student"), 3000)
          return
        }
        const data = await res.json()
        if (cancelled) return

        if (data.status !== "in_progress" || !data.question_id) {
          // Already finished (or was abandoned) -- nothing left to answer.
          router.push(`/interview/${sessionId}/summary`)
          return
        }

        setQuestion({
          question_id: data.question_id,
          question_number: data.question_number,
          question_text: data.question,
          phase: data.phase,
          time_budget_seconds: data.time_budget_seconds ?? 120,
          is_followup: !!data.is_followup,
          provenance: data.provenance ?? null,
        })
        setProgress(data.progress ?? 0)
        setTimeLeft(data.time_budget_seconds ?? 120)
        setReady(true)
      } catch (err: any) {
        if (cancelled) return
        console.error("Failed to load interview state:", err)
        toast.error("Couldn't load your interview. Please try again.")
      }
    }

    void loadState()
    return () => {
      cancelled = true
    }
  }, [sessionIdParam, mockUserId, router])

  // 2. Camera & mic initialization
  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (e) {
        console.error("Camera access denied.", e)
        toast.error("Camera access denied. Please enable camera permissions.")
      }
    }
    initCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // 3. Countdown -- one interval, owned by isAnswering, cleaned up on every change.
  useEffect(() => {
    if (!isAnswering) return
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [isAnswering])

  // 4. Start answering
  const startAnswering = () => {
    if (!streamRef.current) return
    videoChunksRef.current = []
    audioChunksRef.current = []

    const videoRecorder = new window.MediaRecorder(streamRef.current, {
      mimeType: "video/webm; codecs=vp8,opus"
    })
    videoRecorder.ondataavailable = e => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data)
    }
    videoRecorderRef.current = videoRecorder

    const audioStream = new MediaStream(streamRef.current.getAudioTracks())
    const audioRecorder = new window.MediaRecorder(audioStream, { mimeType: "audio/webm" })
    audioRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }
    audioRecorderRef.current = audioRecorder

    videoRecorder.start()
    audioRecorder.start()

    setIsAnswering(true)
    setIsRecording(true)
    toast.success("Recording started. You may begin your answer.")
  }

  async function uploadWithRetry(
    bucket: string,
    path: string,
    blob: Blob,
    contentType: string,
    retries = 3
  ) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { cacheControl: "3600", upsert: true, contentType })
      if (!error) return
      console.warn(`Upload attempt ${attempt} failed for ${bucket}/${path}:`, error.message)
      await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`Upload failed for ${bucket}/${path}`)
  }

  // 5. Submit the current answer and advance to whatever the backend
  // decides comes next -- a follow-up, the next phase's question, or the
  // end of the session.
  const handleSubmitAnswer = async () => {
    if (loading || !question) return
    setLoading(true)
    setIsAnswering(false)
    setIsRecording(false)

    const liveRecorders = [videoRecorderRef.current, audioRecorderRef.current]
      .filter((r): r is MediaRecorder => r != null && r.state === "recording")

    if (liveRecorders.length > 0) {
      await Promise.all(
        liveRecorders.map(
          recorder =>
            new Promise<void>(resolve => {
              recorder.onstop = () => resolve()
              recorder.stop()
            })
        )
      )
      await new Promise(r => setTimeout(r, 300)) // let the final chunk flush
    }

    const qNum = question.question_number
    const videoBlob = new Blob(videoChunksRef.current, { type: "video/webm" })
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
    videoChunksRef.current = []
    audioChunksRef.current = []

    const hasRecording = audioBlob.size > 0
    const sessionId = validateSessionId(sessionIdParam)

    if (hasRecording) {
      try {
        await Promise.all([
          uploadWithRetry("mock.interview.videos", `videos/${sessionId}/${qNum}/video.webm`, videoBlob, "video/webm"),
          uploadWithRetry("mock.interview.answers", `answers/${sessionId}/${qNum}/audio.webm`, audioBlob, "audio/webm"),
        ])
      } catch (e: any) {
        console.error(`Upload failed for Q${qNum}:`, e)
        toast.error("Couldn't save that answer. Please check your connection.")
        setLoading(false)
        return
      }
    } else {
      toast("No answer recorded for that question — moving on.")
    }

    try {
      const res = await APIStudent(`/interview/sessions/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip: !hasRecording }),
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(detail || "Failed to submit answer")
      }
      const data = await res.json()

      if (typeof data.evaluation?.score === "number") {
        toast.success(`Scored ${data.evaluation.score}/10`)
      }
      setProgress(data.progress ?? progress)

      if (data.done || !data.next) {
        toast.success("Interview completed! Generating your report…")
        setTimeout(() => router.push(`/interview/${sessionId}/summary`), 1200)
        return
      }

      setQuestion({
        question_id: data.next.question_id,
        question_number: data.next.question_number,
        question_text: data.next.question,
        phase: data.next.phase,
        time_budget_seconds: data.next.time_budget_seconds ?? 120,
        is_followup: !!data.next.is_followup,
        provenance: data.next.provenance ?? null,
      })
      setTimeLeft(data.next.time_budget_seconds ?? 120)
    } catch (e: any) {
      console.error("Failed to submit answer:", e)
      toast.error("Couldn't submit that answer. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Time's up -- its own effect so React's dev-mode double-invoke of a
  // setState updater can't fire the submit sequence twice.
  useEffect(() => {
    if (isAnswering && timeLeft === 0) void handleSubmitAnswer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswering, timeLeft])

  const toggleVideo = () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (track) {
      track.enabled = !videoEnabled
      setVideoEnabled(!videoEnabled)
    }
  }
  const toggleAudio = () => {
    const track = streamRef.current?.getAudioTracks()[0]
    if (track) {
      track.enabled = !audioEnabled
      setAudioEnabled(!audioEnabled)
    }
  }
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  if (!ready || !question) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 border-hairline-strong border-t-ink" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Minimal in-interview bar. Deliberately not the site navbar: this is
          a timed, camera-on task, and a "Settings" link mid-recording is an
          invitation to destroy a session in progress. */}
      <header className="border-b border-hairline bg-canvas">
        <div className="container-content flex h-16 items-center justify-between gap-base">
          <Wordmark />
          <div className="flex items-center gap-base">
            {isRecording && (
              <span className="flex items-center gap-xs text-caption text-error">
                <span className="h-2 w-2 animate-pulse rounded-pill bg-error" />
                Recording
              </span>
            )}
            <span
              className="font-display text-title-md tabular-nums text-ink"
              aria-live="polite"
              aria-label={`${timeLeft} seconds remaining`}
            >
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
      </header>

      <div className="container-content py-xl">
        <div className="mx-auto flex max-w-5xl flex-col gap-base">
          {/* Progress -- time-based: a duration-driven session doesn't know
              its question count in advance, so this tracks elapsed time
              against the session's total duration, not "question N of M". */}
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
            {/* Camera */}
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
              <div className="flex justify-center gap-sm">
                <Button
                  variant={videoEnabled ? "outline" : "destructive"}
                  size="icon"
                  onClick={toggleVideo}
                  aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
                  aria-pressed={!videoEnabled}
                >
                  {videoEnabled ? <Video /> : <VideoOff />}
                </Button>
                <Button
                  variant={audioEnabled ? "outline" : "destructive"}
                  size="icon"
                  onClick={toggleAudio}
                  aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
                  aria-pressed={!audioEnabled}
                >
                  {audioEnabled ? <Mic /> : <MicOff />}
                </Button>
              </div>
              {!audioEnabled && (
                <p className="text-caption text-error">
                  Your microphone is muted. Your answer won&rsquo;t be recorded.
                </p>
              )}
            </Card>

            {/* Question */}
            <Card variant="panel" className="flex flex-col gap-lg lg:col-span-2">
              <h1 className="font-display text-display-sm text-ink md:text-display-md">
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

              {!isAnswering ? (
                <div className="mt-auto flex flex-col gap-base">
                  <p className="text-body-md text-body">
                    You&rsquo;ll have {formatTime(question.time_budget_seconds)} once you
                    start. Speak naturally &mdash; your answer is transcribed and scored
                    afterwards.
                  </p>
                  <Button size="lg" onClick={startAnswering} disabled={loading}>
                    {loading ? (
                      <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                    ) : (
                      <Mic />
                    )}
                    Start recording
                  </Button>
                </div>
              ) : (
                <div className="mt-auto flex flex-col gap-base">
                  <p className="text-body-md text-body">
                    Recording. Move on whenever you&rsquo;re done, or let the timer run out.
                  </p>
                  <Button size="lg" onClick={handleSubmitAnswer} disabled={loading}>
                    {loading ? (
                      <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                    ) : (
                      <SkipForward />
                    )}
                    Submit answer
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
