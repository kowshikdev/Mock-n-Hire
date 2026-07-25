"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Meter, Spinner } from "@/components/ui/states"
import { Wordmark } from "@/components/layout/wordmark"
import { Mic, MicOff, Video, VideoOff, SkipForward, CheckCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { APIStudent } from "@/lib/apiStudent"
import { useAppStore } from "@/lib/store"
import { supabase } from "@/lib/supabase"

// Helper function to validate sessionId
const validateSessionId = (sessionId: any): string => {
  if (typeof sessionId !== "string" || !sessionId.match(/^[\w-]{36}$/)) {
    console.error("[InterviewPage] ERROR: sessionId is not a valid string UUID:", sessionId, typeof sessionId);
    throw new Error("Session ID is invalid or missing.");
  }
  console.info("[InterviewPage] Using sessionId:", sessionId, typeof sessionId);
  return sessionId;
}

type Question = {
  question_text: string
  category: string
  question_number: number
  time_limit?: number
}

export default function InterviewPageClient({ sessionIdParam }: { sessionIdParam: string }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  /*
   * How many questions this session actually has. The backend has always
   * returned it as `total_questions` on every /next-question response; the
   * page ignored it and rendered `questions.length` instead. Since questions
   * are fetched one at a time, that array holds exactly one entry until you
   * advance -- which is why a healthy 9-question session displayed
   * "Question 1 of 1", and why the progress bar jumped to 100% on the first
   * screen.
   */
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [timeLeft, setTimeLeft] = useState(120)
  const [isRecording, setIsRecording] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [isAnswering, setIsAnswering] = useState(false)
  const [loading, setLoading] = useState(false)
  const { user } = useAppStore()
  const mockUserId = user?.id
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const videoChunksRef = useRef<Blob[]>([])
  const audioChunksRef = useRef<Blob[]>([])

  /*
   * Load the first question.
   *
   * This used to be two effects that both GET /next-question/<id>/1 on mount:
   * one to check the session existed, one to actually use the result. Same
   * request, twice, every time -- and the two could disagree about whether to
   * redirect. One fetch does both jobs.
   */
  useEffect(() => {
    let cancelled = false

    async function loadFirstQuestion() {
      if (!mockUserId) {
        toast.error("Please sign in to continue.")
        router.push("/auth/login")
        return
      }
      try {
        const sessionId = validateSessionId(sessionIdParam)
        const res = await APIStudent(`/interview/next-question/${sessionId}/1`, {
          method: "GET",
        })
        if (!res.ok) {
          toast.error("Session not found. Please start a new interview.")
          setTimeout(() => router.push("/dashboard/student"), 3000)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setQuestions([
          {
            question_text: data.question,
            category: data.category,
            question_number: data.question_number,
            time_limit: data.time_limit ?? 120,
          },
        ])
        setTotalQuestions(data.total_questions ?? 1)
        setTimeLeft(data.time_limit ?? 120)
      } catch (err: any) {
        if (cancelled) return
        console.error("Failed to load the first question:", err)
        toast.error("Couldn't load your interview. Please try again.")
      }
    }

    void loadFirstQuestion()
    return () => {
      cancelled = true
    }
  }, [sessionIdParam, mockUserId, router])

  // 3. Utility to fetch specific question number (used for next question)
  const fetchQuestionByNumber = async (qNum: number): Promise<Question | null> => {
    console.info(`[Step 4] Fetching question #${qNum}`)
    try {
      const sessionId = validateSessionId(sessionIdParam);
      const res = await APIStudent(`/interview/next-question/${sessionId}/${qNum}`, { method: "GET" })
      if (!res.ok) throw new Error("Failed to fetch question")
      const data = await res.json()
      if (data.total_questions) setTotalQuestions(data.total_questions)
      return {
        question_text: data.question,
        category: data.category,
        question_number: data.question_number,
        time_limit: data.time_limit ?? 120
      }
    } catch (err: any) {
      console.warn(`[Step 4] No more questions at #${qNum} or failed:`, err.message)
      return null
    }
  }

  const currentQuestion = questions[currentQuestionIndex]
  // Progress runs against the session's real length, not the number of
  // questions fetched so far -- the latter is always "the current one".
  const progress = totalQuestions > 0
    ? ((currentQuestionIndex + 1) / totalQuestions) * 100
    : 0
  const isLastQuestion = totalQuestions > 0 && currentQuestionIndex + 1 >= totalQuestions

  // 4. Camera & mic initialization
  useEffect(() => {
    async function initCamera() {
      try {
        console.info("[Step 5] Initializing camera and microphone...")
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        console.info("[Step 5] Camera/microphone ready.")
      } catch (e) {
        console.error("[Step 5] Camera access denied.", e)
        toast.error("Camera access denied. Please enable camera permissions.")
      }
    }
    initCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      console.info("[Step 5] Camera/microphone streams stopped.")
    }
  }, [])

  /*
   * Countdown.
   *
   * The previous version listed `timeLeft` in the dependency array and
   * returned no cleanup function. So every tick re-ran the effect and started
   * *another* interval while the previous ones kept running: the number of
   * live timers doubled each second, and a 2:00 budget drained in about seven
   * seconds of wall clock. It also called handleNextQuestion() from inside the
   * setState updater, which React invokes twice in development.
   *
   * One interval, owned by `isAnswering`, with the expiry handled as its own
   * effect below (after handleNextQuestion is in scope).
   */
  useEffect(() => {
    if (!isAnswering) return
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [isAnswering])

  // 6. Start answering logic
  const startAnswering = () => {
    if (!streamRef.current) return
    videoChunksRef.current = []
    audioChunksRef.current = []

    // Video recorder
    const videoRecorder = new window.MediaRecorder(streamRef.current, {
      mimeType: "video/webm; codecs=vp8,opus"
    })
    videoRecorder.ondataavailable = e => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data)
    }
    videoRecorderRef.current = videoRecorder

    // Audio-only recorder
    const audioStream = new MediaStream(streamRef.current.getAudioTracks())
    const audioRecorder = new window.MediaRecorder(audioStream, { mimeType: "audio/webm" })
    audioRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }
    audioRecorderRef.current = audioRecorder

    videoRecorder.start()
    audioRecorder.start()

    console.info(`[Step 7] Started recording for Q${currentQuestion?.question_number}`)
    setIsAnswering(true)
    setIsRecording(true)
    toast.success("Recording started. You may begin your answer.")
  }

  // 7. Upload helper with logging
  async function uploadWithRetry(
    bucket: string,
    path: string,
    blob: Blob,
    contentType: string,
    retries = 3
  ) {
    console.info(`[Step 8] Uploading to ${bucket}/${path} (size: ${blob.size} bytes)`)
    for (let attempt = 1; attempt <= retries; attempt++) {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, blob, {
          cacheControl: "3600",
          upsert: true,
          contentType
        })
      if (!error) {
        console.info(`[Step 8] Upload success for ${bucket}/${path} on attempt ${attempt}`)
        return
      }
      console.warn(`[Step 8] Upload attempt ${attempt} failed for ${bucket}/${path}:`, error.message)
      await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`Upload failed for ${bucket}/${path}`)
  }

  // 8. Notify backend after upload (fire-and-forget)
  function notifyBackend(sessionId: string, qNum: number) {
    const validatedSessionId = validateSessionId(sessionId);
    console.info(`[Step 9] Notifying backend for submit-answer/stress, Q${qNum}`)
    // submit-answer
    APIStudent(
      `/interview/submit-answer/${validatedSessionId}/${qNum}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    )
      .then(r => {
        if (!r.ok) return r.text().then(t => Promise.reject(new Error(t)))
        console.info(`[Step 9] [Backend] submit-answer queued Q${qNum}`)
      })
      .catch(e => console.warn(`[Step 9] [submit-answer] ignored: ${e.message}`))

    // stress analysis
    APIStudent(
      `/stress/analyze-stress/${validatedSessionId}/${qNum}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    )
      .then(r => {
        if (!r.ok) return r.json().then(d => Promise.reject(new Error(d.detail)))
        console.info(`[Step 9] [Backend] stress queued Q${qNum}`)
      })
      .catch(e => console.warn(`[Step 9] [stress] ignored: ${e.message}`))
  }

  // 9. Handle Next / Finish, with parallel fetch of next question
  const handleNextQuestion = async () => {
    if (loading) {
      console.info("[Step 10] Already processing next question, ignoring duplicate call.")
      return
    }
    setLoading(true)
    setIsAnswering(false)
    setIsRecording(false)

    /*
     * 1) Stop whichever recorders are actually running.
     *
     * This block used to assign `.onstop` through a non-null assertion on
     * both refs and wait for exactly two callbacks. If the question timer
     * expired before "Start recording" was ever pressed, both refs were null:
     * the assertion threw, the promise never settled, and `loading` stayed
     * true forever -- a spinner on a dead interview with no way out but a
     * reload. Wait only on recorders that exist and are running.
     */
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

    // 2) create blobs
    const qNum = currentQuestion!.question_number
    const videoBlob = new Blob(videoChunksRef.current, { type: "video/webm" })
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })

    /*
     * Those chunks belong to the question that just ended. They were only ever
     * cleared in startAnswering, so skipping a question without recording left
     * the previous answer's audio sitting in the buffer -- and the skip path
     * below would have uploaded it again under the new question's number.
     */
    videoChunksRef.current = []
    audioChunksRef.current = []

    // 3) fetch next question immediately (start in parallel)
    const nextIdx = currentQuestionIndex + 1
    const nextNum = qNum + 1
    const nextQuestionPromise = fetchQuestionByNumber(nextNum)

    /*
     * 4) Upload, but only if there is something to upload. A skipped or
     * timed-out question produces a zero-byte blob; uploading it just gives
     * Whisper silence to transcribe and the evaluator an empty string to
     * score. Advancing without it leaves the answer genuinely unanswered,
     * which the report already knows how to represent.
     */
    const hasRecording = audioBlob.size > 0
    if (hasRecording) {
      try {
        const sessionId = validateSessionId(sessionIdParam)
        await Promise.all([
          uploadWithRetry("mock.interview.videos",
            `videos/${sessionId}/${qNum}/video.webm`, videoBlob, "video/webm"),
          uploadWithRetry("mock.interview.answers",
            `answers/${sessionId}/${qNum}/audio.webm`, audioBlob, "audio/webm")
        ])
      } catch (e: any) {
        console.error(`Upload failed for Q${qNum}:`, e)
        toast.error("Couldn't save that answer. Please check your connection.")
        setLoading(false)
        return
      }

      // 5) queue backend processing (non-blocking)
      notifyBackend(sessionIdParam, qNum)
    } else {
      toast("No answer recorded for that question — moving on.")
    }

    // 6) wait for next question result (started earlier)
    const nextQ = await nextQuestionPromise

    if (nextQ) {
      setQuestions(prev => (prev.length > nextIdx ? prev : [...prev, nextQ]))
      setCurrentQuestionIndex(nextIdx)
      setTimeLeft(nextQ.time_limit ?? 120)
      console.info(`[Step 13] Updated UI to next question Q${nextQ.question_number}`)
    } else {
      toast.success("Interview completed! Generating your report…")
      console.info("[Step 13] No more questions. Redirecting to summary.")
      const sessionId = validateSessionId(sessionIdParam);
      await APIStudent(`/interview/final-report/${sessionId}`, { method: "GET" });
      setTimeout(() => router.push(`/interview/${sessionId}/summary`), 1500)
    }
    setLoading(false)
  }

  /*
   * Time's up. Kept as its own effect rather than a call inside the countdown's
   * setState updater, which React runs twice in development -- that fired the
   * whole upload-and-advance sequence twice for a single expiry.
   */
  useEffect(() => {
    if (isAnswering && timeLeft === 0) void handleNextQuestion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswering, timeLeft])

  const toggleVideo = () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (track) {
      track.enabled = !videoEnabled
      setVideoEnabled(!videoEnabled)
      console.info(`[Step 14] Video toggled: ${!videoEnabled ? "ON" : "OFF"}`)
    }
  }
  const toggleAudio = () => {
    const track = streamRef.current?.getAudioTracks()[0]
    if (track) {
      track.enabled = !audioEnabled
      setAudioEnabled(!audioEnabled)
      console.info(`[Step 14] Audio toggled: ${!audioEnabled ? "ON" : "OFF"}`)
    }
  }
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
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
          {/* Progress */}
          <div className="flex flex-col gap-xs">
            <div className="flex items-baseline justify-between gap-sm">
              <span className="eyebrow">
                Question {currentQuestionIndex + 1} of {totalQuestions || "…"}
              </span>
              {currentQuestion?.category && (
                <Badge variant="default">{currentQuestion.category}</Badge>
              )}
            </div>
            <Meter value={progress} ariaLabel="Interview progress" />
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
                {currentQuestion?.question_text || ""}
              </h1>

              {!isAnswering ? (
                <div className="mt-auto flex flex-col gap-base">
                  <p className="text-body-md text-body">
                    You&rsquo;ll have {formatTime(currentQuestion?.time_limit ?? 120)} once you
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
                  <Button size="lg" onClick={handleNextQuestion} disabled={loading}>
                    {loading ? (
                      <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                    ) : isLastQuestion ? (
                      <CheckCircle />
                    ) : (
                      <SkipForward />
                    )}
                    {isLastQuestion ? "Finish interview" : "Next question"}
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
