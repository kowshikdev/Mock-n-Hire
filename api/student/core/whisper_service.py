from groq import Groq

from student.config.settings import settings


class WhisperService:
    def __init__(self):
        self.client = Groq(api_key=settings.LLM_API_KEY)

    def transcribe(self, audio_path: str) -> tuple[str, float | None]:
        """Transcribe an answer and return (text, audio_duration_seconds).

        `response_format="verbose_json"` is what makes the duration
        available at all -- the plain "text" format this used to request
        returns exactly a string, nothing else. That duration is what
        replaces stress.py's OpenCV video-duration probe: the same number,
        read from the file whisper already has open, instead of a second
        download of the *video* upload just to call cv2.VideoCapture on it.

        The Groq SDK's typed `Transcription` response only declares `.text`,
        but its models allow extra fields (`model_config extra="allow"`), so
        `duration` still comes through when the server sends it. Falling
        back to None rather than raising keeps a hiccup in an OpenAI-shaped
        response from failing the whole answer -- callers already handle a
        missing duration by not reporting pace for that answer, which is
        honest and better than a fabricated one.
        """
        with open(audio_path, "rb") as audio_file:
            result = self.client.audio.transcriptions.create(
                file=audio_file,
                model=settings.STT_MODEL,
                response_format="verbose_json",
            )

        duration = getattr(result, "duration", None)
        if duration is None:
            extra = getattr(result, "model_extra", None) or {}
            duration = extra.get("duration")

        try:
            duration = float(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration = None

        return result.text, duration
