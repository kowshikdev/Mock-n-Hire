/**
 * Deciding when the candidate has finished speaking.
 *
 * This is what replaces the "Submit answer" button, and its two failure modes
 * are not symmetric: cutting someone off mid-thought loses their answer,
 * while waiting an extra second costs a pause. Everything here is biased
 * toward the second.
 *
 * Three things make it survive a real room:
 *
 *   1. **The threshold is calibrated, not constant.** Ambient noise varies by
 *      orders of magnitude between a quiet bedroom and a cafe, so a fixed
 *      cutoff either never triggers or triggers on the air conditioning. The
 *      first half-second measures the actual noise floor and the threshold is
 *      set above it.
 *   2. **Silence only counts after speech.** Someone thinking for four
 *      seconds before answering has not finished answering.
 *   3. **A minimum utterance length.** A cough or a chair scrape clears the
 *      threshold briefly; requiring sustained speech stops that ending a turn.
 *
 * If nobody speaks at all the turn still ends, reported as "no speech", which
 * the backend records as an unanswered question rather than an error. Staying
 * silent is how you skip a question, and it needs no button.
 *
 * The decision logic is a pure function (`feedSample`) separate from the
 * Web Audio plumbing, so the behaviour above can be tested against synthetic
 * loudness traces instead of only by talking at a browser.
 */

/** How long a pause has to last before it counts as the end of a turn. */
export const SILENCE_MS = 1600
/** Sustained speech required before a turn can end on silence. */
export const MIN_SPEECH_MS = 700
/** Give up and move on if the candidate never says anything. */
export const NO_SPEECH_TIMEOUT_MS = 25000
/** How long to sample the room before deciding what counts as speech. */
export const CALIBRATION_MS = 500
/** Speech has to be this much louder than the measured noise floor. */
export const NOISE_MULTIPLIER = 2.5
/** Floor under the threshold, so a silent room doesn't trigger on nothing. */
export const MIN_THRESHOLD = 0.012

export type TurnState = {
  startedAt: number
  threshold: number
  noiseSum: number
  noiseCount: number
  calibrated: boolean
  speechStartedAt: number
  lastLoudAt: number
  everSpoke: boolean
}

/** `continue` keeps listening; the others end the turn. */
export type TurnDecision = "continue" | "end-after-speech" | "end-no-speech"

export function createTurnState(now: number): TurnState {
  return {
    startedAt: now,
    threshold: MIN_THRESHOLD,
    noiseSum: 0,
    noiseCount: 0,
    calibrated: false,
    speechStartedAt: 0,
    lastLoudAt: now,
    everSpoke: false,
  }
}

/** Advance the turn state by one loudness sample. Mutates `s`. */
export function feedSample(s: TurnState, rms: number, now: number): TurnDecision {
  const elapsed = now - s.startedAt

  if (elapsed < CALIBRATION_MS) {
    s.noiseSum += rms
    s.noiseCount++
    // Not just "don't decide yet" -- lastLoudAt has to keep moving during
    // calibration, or the first post-calibration sample would see a silence
    // gap the size of the whole calibration window.
    s.lastLoudAt = now
    return "continue"
  }

  if (!s.calibrated) {
    const floor = s.noiseCount > 0 ? s.noiseSum / s.noiseCount : 0
    s.threshold = Math.max(MIN_THRESHOLD, floor * NOISE_MULTIPLIER)
    s.calibrated = true
  }

  if (rms > s.threshold) {
    s.lastLoudAt = now
    if (!s.speechStartedAt) s.speechStartedAt = now
    if (now - s.speechStartedAt >= MIN_SPEECH_MS) s.everSpoke = true
  } else if (s.speechStartedAt && !s.everSpoke && now - s.lastLoudAt > SILENCE_MS) {
    // A blip that never became speech -- a cough, a door. Reset and keep
    // waiting rather than ending the turn on it.
    s.speechStartedAt = 0
  }

  if (s.everSpoke && now - s.lastLoudAt >= SILENCE_MS) return "end-after-speech"
  if (!s.everSpoke && elapsed >= NO_SPEECH_TIMEOUT_MS) return "end-no-speech"
  return "continue"
}

/** Root-mean-square of a time-domain buffer.
 *
 * RMS rather than peak: a peak reacts to a single sample of desk noise,
 * whereas RMS tracks sustained energy, which is what speech is. */
export function rms(buf: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

export type TurnDetectorOptions = {
  /** 0..1 loudness, for the level meter. Fired on every animation frame. */
  onLevel?: (level: number) => void
  /** The turn is over. `spoke` is false when nothing was ever said. */
  onTurnEnd: (spoke: boolean) => void
}

export function createVoiceTurnDetector(stream: MediaStream, opts: TurnDetectorOptions) {
  const AudioCtx: typeof AudioContext =
    window.AudioContext || (window as any).webkitAudioContext
  let ctx: AudioContext | null = null
  let raf = 0
  let stopped = false
  let state: TurnState | null = null

  function tick(analyser: AnalyserNode, buf: Float32Array) {
    if (stopped || !state) return
    analyser.getFloatTimeDomainData(buf)

    const level = rms(buf)
    opts.onLevel?.(level)

    const decision = feedSample(state, level, performance.now())
    if (decision !== "continue") {
      stop()
      opts.onTurnEnd(decision === "end-after-speech")
      return
    }
    raf = requestAnimationFrame(() => tick(analyser, buf))
  }

  function start() {
    if (stopped) return
    ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    // Smoothing is for frequency data; time-domain samples are averaged into
    // an RMS above, so leave the raw values alone.
    analyser.smoothingTimeConstant = 0
    source.connect(analyser)

    const buf = new Float32Array(analyser.fftSize)
    state = createTurnState(performance.now())
    raf = requestAnimationFrame(() => tick(analyser, buf))
  }

  function stop() {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    // Closing releases the audio hardware tap. The MediaStream itself is
    // owned by the caller and deliberately left running -- it is the same
    // stream the next turn listens on.
    void ctx?.close().catch(() => {})
    ctx = null
  }

  return { start, stop }
}
