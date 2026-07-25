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

settings = Settings()