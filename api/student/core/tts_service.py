"""Speaking the interviewer's questions aloud.

An interview where the questions appear as text is a form. Hearing the
question is most of what makes practising feel like the real thing -- you
process it at someone else's pace, you can't re-read it while you stall, and
you have to start speaking without a script in front of you.

Groq serves TTS on the same endpoint family and the same API key as the chat
and transcription calls, so this adds no new vendor, credential or bill.
There is a browser fallback (`speechSynthesis`) on the client for when this
is unavailable; that is deliberately the *client's* fallback rather than
this module's, because a robot voice that starts instantly beats a good
voice that arrives late, and only the client knows whether the audio it
asked for has turned up yet.
"""

from __future__ import annotations

import logging

from groq import Groq

from student.config.settings import settings

logger = logging.getLogger(__name__)

# Orpheus supports inline vocal direction (e.g. "[curious] tell me...").
# Not used: an interviewer's delivery should be level. Bracketed directions
# would also be read aloud verbatim by the browser fallback, which has no
# idea they are markup, so anything added here has to be safe in both paths.
MAX_INPUT_CHARS = 1200


class TTSUnavailable(Exception):
    """Raised so the caller can fall through to the browser voice rather than
    failing the request. A question that is displayed but not spoken is a
    degraded interview; a question that never arrives is a broken one."""


class TTSService:
    def __init__(self):
        self.client = Groq(api_key=settings.LLM_API_KEY)

    def speak(self, text: str) -> tuple[bytes, str]:
        """Render text to speech. Returns (audio_bytes, mime_type)."""
        text = (text or "").strip()
        if not text:
            raise TTSUnavailable("Nothing to speak")
        if not settings.TTS_ENABLED:
            raise TTSUnavailable("Server-side TTS is disabled")

        try:
            response = self.client.audio.speech.create(
                model=settings.TTS_MODEL,
                voice=settings.TTS_VOICE,
                input=text[:MAX_INPUT_CHARS],
                response_format=settings.TTS_FORMAT,
            )
            audio = response.read()
        except Exception as e:
            # Includes the model not being enabled on the account, which is
            # the most likely failure and is not worth a stack trace on every
            # question.
            logger.warning(f"TTS failed ({settings.TTS_MODEL}): {e}")
            raise TTSUnavailable(str(e)) from e

        if not audio:
            raise TTSUnavailable("TTS returned no audio")
        return audio, _MIME.get(settings.TTS_FORMAT, "application/octet-stream")


_MIME = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
}
