import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # Use the correct env var name
    LLM_API_KEY = os.getenv("LLM_API_KEY")

    # Was hardcoded as "llama3-8b-8192" in groq_service.py/report_service.py
    # (and as "mistral-saba-24b" in process_resumes.py on the recruiter
    # side). Groq decommissioned llama3-8b-8192 outright, which broke every
    # question-generation and answer-evaluation call with a
    # model_decommissioned 400. One shared LLM_MODEL for every chat
    # completion call now -- same name as LLM_API_KEY -- so the next
    # deprecation is one env var change on Railway, not a deploy across two
    # files. Default is a current model from Groq's lineup
    # (console.groq.com/docs/models).
    LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")

    # Speech-to-text, same reasoning as LLM_MODEL. This was hardcoded as
    # "whisper-large-v3-turbo" in whisper_service.py -- a model from the same
    # Groq catalog that retired llama3-8b-8192 out from under this codebase.
    # There is no reason for the next one to require a deploy either.
    STT_MODEL = os.getenv("STT_MODEL", "whisper-large-v3-turbo")

    # Model behind the prep agent (student/agents/prep_agent.py), not the
    # live per-turn calls above. deepagents needs genuinely strong multi-step
    # tool calling, which llama-3.1-8b-instant is not evaluated for. No Groq
    # model appears on LangChain's own deepagents eval table at all -- an
    # accepted risk, see INTERVIEW_ARCHITECTURE.md section 3 for why the
    # fallback path (prep failure -> resume-only generation) is what makes
    # that acceptable. gpt-oss-120b is the strongest tool-caller Groq
    # currently serves.
    AGENT_MODEL = os.getenv("AGENT_MODEL", "openai/gpt-oss-120b")

    # Company-style question grounding (issue #11). Optional: unset means
    # every session runs in generic (resume-only) mode, not a startup error.
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

    # Text-to-speech for the interviewer's questions. Same Groq key as
    # everything else -- no new vendor or credential.
    #
    # Off by one env var rather than by deleting the route, because the
    # frontend already falls back to the browser's own `speechSynthesis`
    # when the server returns no audio: flipping this to false degrades the
    # voice, it does not silence the interview. Useful if the model is not
    # enabled on the account or its rate limit (250 req/min) becomes the
    # binding constraint.
    TTS_ENABLED = os.getenv("TTS_ENABLED", "true").lower() not in ("false", "0", "no")
    TTS_MODEL = os.getenv("TTS_MODEL", "canopylabs/orpheus-v1-english")
    TTS_VOICE = os.getenv("TTS_VOICE", "troy")
    # Orpheus defaults to wav, which is uncompressed -- a 20-word question is
    # a few hundred KB. Kept as the default because it is the documented one;
    # override to a compressed format if bandwidth matters more than the
    # extra decode step.
    TTS_FORMAT = os.getenv("TTS_FORMAT", "wav")

settings = Settings()