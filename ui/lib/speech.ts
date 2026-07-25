/**
 * The fallback voice.
 *
 * The server renders questions with a real TTS model, but that can be
 * disabled, rate limited, or simply down, in which case the audio endpoint
 * returns 204. Falling back to the browser's built-in `speechSynthesis` means
 * the interview keeps its shape -- you still *hear* the question and answer
 * without reading, which is most of what makes practising feel real -- at the
 * cost of a worse voice.
 *
 * Deliberately resolves rather than rejects on every failure path. The caller
 * awaits this before it starts listening, so a rejection would strand the
 * candidate on a question nobody ever asked. A silent question is recoverable
 * (it is on screen); a stuck interview is not.
 */

/** Longest we will wait on the speech engine before moving on regardless. */
const MAX_SPEECH_MS = 30000

export function cancelBrowserSpeech() {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* not available; nothing to cancel */
  }
}

export function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined
    if (!synth || !text.trim()) {
      resolve()
      return
    }

    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }

    // Chrome drops `onend` if an utterance is cancelled or the tab is
    // backgrounded mid-sentence, which would otherwise hang the turn here
    // forever. The timeout is the backstop, sized well past any real
    // question.
    const timer = setTimeout(done, MAX_SPEECH_MS)

    try {
      synth.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      // Default rate reads noticeably faster than an interviewer speaks.
      utterance.rate = 0.95
      utterance.onend = done
      utterance.onerror = done
      synth.speak(utterance)
    } catch {
      done()
    }
  })
}
