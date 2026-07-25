"""Runs session prep as a background task and persists the result.

The live interview loop never calls this directly and never waits on it -- it
opens with a fixed self-introduction (which needs no preparation at all) while
this runs, and only reads `mock_interview_briefs` when it later needs
material. That ordering is not incidental: prep takes roughly 45 seconds
against Tavily, and a candidate introducing themselves takes 60-90. The opener
buys prep its entire runway.

Prep is two stages with very different cost and reliability:

1. **Fit analysis** -- one fast Groq call comparing the resume against the
   role and, if given, the job description. No external dependencies, ~2s,
   and it is the thing a JD actually buys: "the posting asks for Kafka and
   your resume shows RabbitMQ" is a question no role-title guessing produces.
2. **Research** -- the deepagents/Tavily run. Minutes, network-dependent,
   and the part that can genuinely fail.

They are written separately and in that order, so stage 1's result is
already usable before stage 2 finishes, and a stage-2 failure downgrades the
session to a JD-grounded interview rather than a generic one. Prep now only
reports `failed` if *both* stages fail; that used to be a single all-or-
nothing call where a research failure discarded everything.
"""

from __future__ import annotations

import logging

from student.agents.prep_agent import run_prep
from student.config.settings import settings
from student.core.resume_parser import profile_to_prompt_context

logger = logging.getLogger(__name__)


def start_prep(
    supabase,
    groq_service,
    session_id: str,
    profile: dict,
    target_role: str,
    company: str | None,
    job_description: str | None = None,
    question_targets: dict[str, int] | None = None,
) -> None:
    """Entry point for a FastAPI BackgroundTask. Never raises -- every branch
    writes a terminal status, so the interview loop's read of it is never
    left hanging on "pending" forever.
    """
    fit = {"role_summary": "", "focus_areas": []}
    try:
        supabase.table("mock_interview_briefs").update(
            {"status": "running"}
        ).eq("session_id", session_id).execute()

        candidate_context = profile_to_prompt_context(profile)
        try:
            fit = groq_service.analyse_fit(candidate_context, target_role, job_description)
            # Written before research starts, so the loop can steer questions
            # at real gaps from the second question onward instead of waiting
            # out the whole Tavily run.
            _write(supabase, session_id, "running", _brief_from(fit))
            logger.info(
                f"Fit analysis ready for session {session_id}: "
                f"{len(fit['focus_areas'])} focus areas"
            )
        except Exception as e:
            logger.error(f"Fit analysis failed for session {session_id}: {e}", exc_info=True)

        if not settings.TAVILY_API_KEY:
            logger.info(f"No TAVILY_API_KEY set; session {session_id} runs without research")
            _write(supabase, session_id, "ready", _brief_from(fit, reason="no_tavily_key"))
            return

        try:
            brief = run_prep(
                profile=profile,
                target_role=target_role,
                company=company,
                tavily_api_key=settings.TAVILY_API_KEY,
                job_description=job_description,
                question_targets=question_targets,
                focus_areas=fit["focus_areas"],
            )
        except Exception as e:
            # The expensive, fragile half failed. The cheap half may not
            # have, and a JD-grounded interview is a long way from a broken
            # one -- so this is a downgrade, not a failure.
            logger.error(f"Research failed for session {session_id}: {e}", exc_info=True)
            if fit["focus_areas"]:
                _write(supabase, session_id, "ready", _brief_from(fit, reason="research_failed"))
                logger.info(f"Session {session_id} continues on fit analysis alone")
            else:
                _fail(supabase, session_id, str(e))
            return

        brief["role_summary"] = fit["role_summary"]
        brief["focus_areas"] = fit["focus_areas"]
        _write(supabase, session_id, "ready", brief)
        logger.info(
            f"Prep ready for session {session_id}: grounded={brief.get('grounded')}, "
            f"{len(brief.get('questions', []))} question seeds"
        )
    except Exception as e:
        logger.error(f"Prep failed for session {session_id}: {e}", exc_info=True)
        _fail(supabase, session_id, str(e))


def _brief_from(fit: dict, reason: str | None = None) -> dict:
    """A brief carrying only what the fit pass produced.

    `grounded` is False by definition here: nothing external was consulted,
    and the candidate is shown that distinction.
    """
    return {
        "grounded": False,
        "company_summary": "",
        "role_focus": [a["topic"] for a in fit["focus_areas"]],
        "role_summary": fit["role_summary"],
        "focus_areas": fit["focus_areas"],
        "questions": [],
        **({"reason": reason} if reason else {}),
    }


def _write(supabase, session_id: str, status: str, brief: dict) -> None:
    supabase.table("mock_interview_briefs").update(
        {
            "status": status,
            "brief": brief,
            "question_bank": brief.get("questions", []),
        }
    ).eq("session_id", session_id).execute()


def _fail(supabase, session_id: str, error: str) -> None:
    try:
        supabase.table("mock_interview_briefs").update(
            {"status": "failed", "error": error[:500]}
        ).eq("session_id", session_id).execute()
    except Exception as e:
        # If even the failure write doesn't land, the row stays "running".
        # The loop treats anything that isn't "ready" the same way, so this
        # is a missed log line, not a stuck interview.
        logger.error(f"Could not record prep failure for session {session_id}: {e}")
