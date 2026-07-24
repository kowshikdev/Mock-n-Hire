import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # Use the correct env var name
    LLM_API_KEY = os.getenv("LLM_API_KEY")

settings = Settings()