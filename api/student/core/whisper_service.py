from groq import Groq

from student.config.settings import settings


class WhisperService:
    def __init__(self):
        self.client = Groq(api_key=settings.LLM_API_KEY)

    def transcribe_audio(self, audio_path: str) -> str:
        try:
            with open(audio_path, "rb") as audio_file:
                transcription = self.client.audio.transcriptions.create(
                    file=audio_file,
                    model=settings.STT_MODEL,
                    response_format="text",
                )
            return transcription
        except Exception as e:
            raise Exception(f"Error transcribing audio: {str(e)}")
