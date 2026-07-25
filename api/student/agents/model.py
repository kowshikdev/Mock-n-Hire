"""The model behind the prep agent.

Deliberately not settings.LLM_MODEL. That one drives fast, single-turn calls
(question phrasing, answer evaluation) and defaults to llama-3.1-8b-instant --
fine for those, but deepagents needs genuinely good multi-step tool calling,
which is not a given: LangChain's own eval suite shows several frontier
models scoring under 30% overall on it.

No Groq model appears on that eval table at all, which is a real, accepted
risk -- see INTERVIEW_ARCHITECTURE.md section 3 for why the fallback (prep
failing degrades to resume-only generation, never a broken interview) is what
makes that risk acceptable rather than something to route around.
"""

from __future__ import annotations

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from student.config.settings import settings


def get_agent_model() -> BaseChatModel:
    return init_chat_model(
        model=f"groq:{settings.AGENT_MODEL}",
        api_key=settings.LLM_API_KEY,
    )
