"""Runs the prep agent as a background task and persists the result.

The live interview loop (Stage 4) never calls the agent directly and never
waits on it -- it starts the session immediately with a resume-derived
warm-up question, and checks `mock_interview_briefs.status` only when it
later needs company-style questions. This module is what makes that
possible: it owns every way prep can end (ready, failed, or skipped because
there is no Tavily key) and guarantees the row always lands in one of those
states, so the interview loop's read of it is never left hanging on "pending"
forever.
"""

from __future__ import annotations

import logging

from student.agents.prep_agent import run_prep
from student.config.settings import settings

logger = logging.getLogger(__name__)


def start_prep(supabase, session_id: str, profile: dict, target_role: str, company: str | None) -> None:
    """Entry point for a FastAPI BackgroundTask. Never raises -- every branch
    below writes a terminal status, and the one that could still fail
    unexpectedly is wrapped so a bug here degrades to a resume-only session
    instead of an unhandled exception disappearing into Starlette's task
    runner with the row stuck on "pending".
    """
    try:
        supabase.table("mock_interview_briefs").update(
            {"status": "running"}
        ).eq("session_id", session_id).execute()

        if not settings.TAVILY_API_KEY:
            logger.info(f"No TAVILY_API_KEY set; session {session_id} runs generic mode")
            _write_result(supabase, session_id, "ready", brief={"grounded": False, "reason": "no_tavily_key"})
            return

        brief = run_prep(profile, target_role, company, settings.TAVILY_API_KEY)
        _write_result(supabase, session_id, "ready", brief=brief)
        logger.info(
            f"Prep ready for session {session_id}: grounded={brief.get('grounded')}, "
            f"{len(brief.get('questions', []))} question seeds"
        )
    except Exception as e:
        logger.error(f"Prep failed for session {session_id}: {e}", exc_info=True)
        try:
            supabase.table("mock_interview_briefs").update(
                {"status": "failed", "error": str(e)[:500]}
            ).eq("session_id", session_id).execute()
        except Exception as write_error:
            # If even the failure write doesn't land, the row is still
            # "running" -- Stage 4's brief read treats anything that isn't
            # "ready" the same way (fall back to resume-only), so this is a
            # missed log line, not a stuck interview.
            logger.error(f"Could not record prep failure for session {session_id}: {write_error}")


def _write_result(supabase, session_id: str, status: str, brief: dict) -> None:
    supabase.table("mock_interview_briefs").update(
        {
            "status": status,
            "brief": brief,
            "question_bank": brief.get("questions", []),
        }
    ).eq("session_id", session_id).execute()
