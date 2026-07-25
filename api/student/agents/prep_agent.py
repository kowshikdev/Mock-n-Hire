"""The prep agent: open-ended, once-per-session research that builds an
interview brief before the live loop starts.

This is deliberately the only place deepagents appears in the product. The
live interview loop (Stage 4) has a fixed control flow and a candidate
waiting on every turn -- there is no plan to make there, and an agent
framework would buy latency and new failure modes in exchange for flexibility
the loop has no use for. Prep is the opposite: an unknown number of steps,
real judgement about when enough research is enough, and minutes rather than
seconds of budget. See INTERVIEW_ARCHITECTURE.md section 3.
"""

from __future__ import annotations

import json
import logging

from deepagents import create_deep_agent
from groq import Groq

from student.agents.model import get_agent_model
from student.agents.schemas import DIFFICULTY_HINTS, InterviewBrief, QuestionSeed
from student.agents.tavily_tools import build_tavily_tools
from student.config.settings import settings
from student.core.resume_parser import profile_to_prompt_context

logger = logging.getLogger(__name__)

# A research trajectory that hasn't converged in this many model turns is
# looping, not thinking. This runs in a background task where nothing is
# watching it, so it needs its own ceiling.
RECURSION_LIMIT = 40

PREP_INSTRUCTIONS = """You are preparing the research brief for one candidate's mock interview.
You do not conduct the interview yourself -- you build the material another
system will use to run it.

## Workflow

1. Use write_todos to plan your research before searching anything. The
   right number of searches depends entirely on what exists for this
   company and role; do not assume a fixed number of steps.
2. If a company was named, search_interview_reports first. If you get
   several real reports, cluster what they describe into a handful of
   distinct themes (a theme is something like "distributed systems failure
   modes" or "behavioral: handling conflicting priorities") rather than
   treating each report as its own theme.
3. If a source's content came back empty, call extract_pages on it -- but
   only for results you actually plan to use. Do not extract everything you
   found "just in case".
4. If you want the company's own perspective (their engineering blog, tech
   stack, values), use map_company_domain then extract_pages on what looks
   relevant.
5. For anything that would clutter your own context -- reading through many
   long, similar reports on one company, for instance -- delegate that dive
   to a subagent via the task() tool and have it report back only what
   matters. Keep your own context focused on planning and synthesis.
6. Finish by writing your findings out as your final message, in plain
   markdown. Cover: what you learned about the company and role, the
   competencies this role actually seems to test for, and then 6-10
   questions. For each question give the question text, the theme it
   probes, a difficulty from foundational/applied/proficient/advanced/expert,
   and the source URLs and publication dates behind it (write "resume-derived,
   no sources" for the ones that have none).

Every question must be an ORIGINAL question you wrote that matches a pattern
you found -- never a question copied verbatim from a source. Attribute
sources honestly: a question derived from the candidate's resume alone has no
sources, and saying so is the correct answer, not a gap to paper over. Never
list a URL you did not actually retrieve.

## What "enough" looks like

If searches turn up nothing usable (no company named, or a company with no
public interview reports), stop searching after one or two honest attempts
and write up a resume-only brief. Research that finds nothing is not a
failure to fix with more searches -- it's the correct answer for that
candidate.
"""

# Phase two. Deliberately a plain, tool-free chat completion rather than the
# agent's own structured output -- see create_prep_agent's docstring.
EXTRACTION_SYSTEM = (
    "You convert an interview researcher's written findings into strict JSON. "
    "You transcribe what the findings say -- you never add questions, sources, "
    "or dates that do not appear in them. You reply with JSON only."
)

BRIEF_JSON_SHAPE = """{
  "company_summary": "what the findings say about the company, or \\"\\" if no company was researched",
  "role_focus": ["competency", "..."],
  "questions": [
    {
      "text": "the question exactly as written in the findings",
      "theme": "what it probes",
      "difficulty_hint": "one of: foundational | applied | proficient | advanced | expert",
      "source_count": 0,
      "source_urls": ["https://..."],
      "date_range": ["YYYY-MM-DD", "YYYY-MM-DD"]
    }
  ]
}"""


def create_prep_agent(tavily_api_key: str):
    """The research half. Tools, no `response_format` -- on purpose.

    Both of langchain's structured-output strategies are structurally
    unsound for this agent on Groq, and each was confirmed against a live
    deployment:

    - ProviderStrategy (JSON mode) is *impossible*. Groq rejects
      `response_format={"type":"json_object"}` combined with bound tools
      outright: 400, "json mode cannot be combined with tool/function
      calling". Passing the bare Pydantic class picks this path, because
      langchain's auto-detection reads `model.profile["structured_output"]`
      (True here) and carves out only Gemini's version of the same conflict.
    - ToolStrategy is *unreliable*. It binds the schema as a tool and forces
      `tool_choice`, so the model has to end a long tool-using trajectory by
      calling one more tool. gpt-oss-120b instead wrote the answer as
      ordinary text -- literally "**InterviewBrief**" followed by valid JSON
      -- and Groq 400'd it as `tool_use_failed`. The research was excellent
      and entirely discarded on a serialisation technicality.

    So the fix isn't picking the better of two bad strategies: it's not
    asking one call to both finish the research and emit a strict schema.
    The agent now ends in prose, and `_extract_brief` converts that prose in
    a separate, tool-free call where JSON mode is legal and reliable. That
    also makes serialisation independently retryable -- a malformed brief
    costs one cheap call, not another minute of re-researching.
    """
    return create_deep_agent(
        model=get_agent_model(),
        tools=build_tavily_tools(tavily_api_key),
        system_prompt=PREP_INSTRUCTIONS,
    )


def _final_text(result: dict) -> str:
    """The agent's closing message as plain text.

    Message content is a str for simple replies but a list of content blocks
    when the model emits reasoning or multiple parts, so both shapes have to
    be handled -- gpt-oss is a reasoning model and does emit the list form.
    """
    messages = result.get("messages") or []
    if not messages:
        return ""
    content = getattr(messages[-1], "content", None)
    if content is None and isinstance(messages[-1], dict):
        content = messages[-1].get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "\n".join(p for p in parts if p).strip()
    return ""


def _extract_brief(findings: str) -> dict:
    """Turn the researcher's written findings into a validated brief."""
    completion = Groq(api_key=settings.LLM_API_KEY).chat.completions.create(
        model=settings.AGENT_MODEL,
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Findings:\n\"\"\"\n{findings}\n\"\"\"\n\n"
                    f"Return JSON of exactly this shape:\n{BRIEF_JSON_SHAPE}"
                ),
            },
        ],
        # Legal here precisely because no tools are bound to this call.
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=4000,
    )
    return _normalise_brief(json.loads(completion.choices[0].message.content))


def _normalise_brief(payload: dict) -> dict:
    """Validate and repair the extracted brief.

    Malformed individual seeds are dropped rather than failing the whole
    brief -- eight good questions and one the model garbled should still
    produce a usable interview.
    """
    seeds: list[QuestionSeed] = []
    for raw in payload.get("questions") or []:
        if not isinstance(raw, dict):
            continue
        text = (raw.get("text") or "").strip()
        if not text:
            continue
        hint = (raw.get("difficulty_hint") or "").strip().lower()
        urls = [u for u in (raw.get("source_urls") or []) if isinstance(u, str) and u.startswith("http")]
        try:
            seeds.append(QuestionSeed(
                text=text,
                theme=(raw.get("theme") or "").strip() or "general",
                difficulty_hint=hint if hint in DIFFICULTY_HINTS else "applied",
                # Counted from the URLs actually present, never taken on the
                # model's word. source_count is what the candidate is shown
                # as evidence of grounding, so it has to be derived from
                # something real rather than asserted.
                source_count=len(urls),
                source_urls=urls,
                date_range=[d for d in (raw.get("date_range") or []) if isinstance(d, str)][:2],
            ))
        except Exception as e:
            logger.warning(f"Dropping malformed question seed: {e}")

    return InterviewBrief(
        # Derived, not reported. The prompt asks for honest provenance, but
        # "did any question actually come with a source" is checkable, so it
        # is checked instead of trusted.
        grounded=any(s.source_count > 0 for s in seeds),
        company_summary=(payload.get("company_summary") or "").strip(),
        role_focus=[r for r in (payload.get("role_focus") or []) if isinstance(r, str)],
        questions=seeds,
    ).model_dump()


def run_prep(
    profile: dict,
    target_role: str,
    company: str | None,
    tavily_api_key: str,
) -> dict:
    """Run the prep agent to completion and return the brief as a plain dict.

    Synchronous and blocking by design -- the caller (Stage 4's prep_service)
    is expected to run this inside a FastAPI BackgroundTask, off the request
    that started the session, not on it.
    """
    agent = create_prep_agent(tavily_api_key)

    candidate_context = profile_to_prompt_context(profile) or "(resume could not be parsed into structure)"
    company_line = (
        f"Target company: {company}"
        if company
        else "No specific target company was given -- ground the brief in the resume and role alone."
    )

    user_message = f"""Target role: {target_role}
{company_line}

Candidate resume:
{candidate_context}

Research this and produce the interview brief."""

    result = agent.invoke(
        {"messages": [{"role": "user", "content": user_message}]},
        {"recursion_limit": RECURSION_LIMIT},
    )

    findings = _final_text(result)
    if not findings:
        raise RuntimeError("Prep agent finished without writing up any findings")

    brief = _extract_brief(findings)
    if not brief["questions"]:
        raise RuntimeError("Prep agent's findings yielded no usable questions")
    return brief
