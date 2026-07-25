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

from deepagents import create_deep_agent

from student.agents.model import get_agent_model
from student.agents.schemas import InterviewBrief
from student.agents.tavily_tools import build_tavily_tools
from student.core.resume_parser import profile_to_prompt_context

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
6. Write 6-10 QuestionSeeds. Every one must be an ORIGINAL question you
   wrote that matches a pattern you found -- never a question copied
   verbatim from a source. If a question came from real research, set
   source_count, source_urls, and date_range honestly. If it's derived from
   the candidate's resume alone with no external grounding, leave those at
   their defaults (0, [], []) -- do not invent sources to make a question
   look more grounded than it is.
7. Set `grounded` to True only if at least one question actually has
   source_count > 0. A resume-only brief is a legitimate, honest outcome --
   report it as one rather than padding it with fabricated provenance.

## What "enough" looks like

If searches turn up nothing usable (no company named, or a company with no
public interview reports), stop searching after one or two honest attempts
and produce a resume-only brief. Research that finds nothing is not a
failure to fix with more searches -- it's the correct answer for that
candidate.
"""


def create_prep_agent(tavily_api_key: str):
    tools = build_tavily_tools(tavily_api_key)
    return create_deep_agent(
        model=get_agent_model(),
        tools=tools,
        system_prompt=PREP_INSTRUCTIONS,
        response_format=InterviewBrief,
    )


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

    result = agent.invoke({"messages": [{"role": "user", "content": user_message}]})
    structured = result.get("structured_response")
    if structured is None:
        raise RuntimeError("Prep agent finished without returning a structured brief")

    return structured.model_dump() if hasattr(structured, "model_dump") else dict(structured)
