"""The candidate's resume library.

`mock_interview_resumes` used to be an append-only upload log: every session
demanded a fresh file, nothing could be named or reused, and one test account
accumulated four near-identical copies of the same CV within a day. Candidates
in reality keep a small number of tailored resumes and choose between them, so
this treats the table as a library -- capped, named, with one default.

The cap is enforced here rather than in the database because hitting it is a
conversation, not a constraint violation: the caller gets the list back and
can ask which one to replace. Nothing is ever silently evicted -- deleting
someone's resume to make room for another is not a decision this code gets to
make on its own.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

MAX_RESUMES = 3

# Columns worth sending to a client. `file_path` is deliberately absent: it is
# a storage key, and the frontend has no business constructing storage URLs
# from it -- downloads go through the backend, which can check ownership.
LIST_COLUMNS = "id,file_name,label,is_default,created_at"


class ResumeLimitReached(Exception):
    """Raised instead of evicting something. Carries the current library so
    the caller can tell the candidate exactly what to delete."""

    def __init__(self, resumes: list[dict]):
        self.resumes = resumes
        super().__init__(
            f"You can keep up to {MAX_RESUMES} resumes. Delete one before uploading another."
        )


class ResumeNotFound(Exception):
    pass


def list_resumes(supabase, user_id: str) -> list[dict]:
    """Every resume this user holds, newest first."""
    rows = (
        supabase.table("mock_interview_resumes")
        .select(LIST_COLUMNS)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return rows.data or []


def _owned_resume(supabase, user_id: str, resume_id: str) -> dict:
    rows = (
        supabase.table("mock_interview_resumes")
        .select("*")
        .eq("id", resume_id)
        .limit(1)
        .execute()
    )
    if not rows.data or rows.data[0]["user_id"] != user_id:
        # Same error for "does not exist" and "belongs to someone else" --
        # distinguishing them tells an attacker which resume ids are real.
        raise ResumeNotFound("Resume not found")
    return rows.data[0]


def register_upload(supabase, user_id: str, file_path: str, file_name: str) -> dict:
    """Record a freshly uploaded file, enforcing the cap.

    The first resume a user ever uploads becomes their default, so that
    starting an interview never requires an explicit pick.
    """
    existing = list_resumes(supabase, user_id)
    if len(existing) >= MAX_RESUMES:
        raise ResumeLimitReached(existing)

    row = (
        supabase.table("mock_interview_resumes")
        .insert({
            "user_id": user_id,
            "file_path": file_path,
            "file_name": file_name,
            "is_default": not existing,
        })
        .execute()
    )
    return row.data[0]


def set_default(supabase, user_id: str, resume_id: str) -> None:
    """Make one resume the default, clearing whichever held it.

    Two statements rather than one, because a partial unique index enforces
    at most one default per user and a single UPDATE would transiently
    violate it. The window between them has *no* default rather than two,
    which `resolve` treats as "use the most recent" -- so an interrupted
    call degrades to a sensible pick instead of a broken account.
    """
    _owned_resume(supabase, user_id, resume_id)

    supabase.table("mock_interview_resumes").update({"is_default": False}).eq(
        "user_id", user_id
    ).eq("is_default", True).execute()

    supabase.table("mock_interview_resumes").update({"is_default": True}).eq(
        "id", resume_id
    ).execute()


def delete_resume(supabase, user_id: str, resume_id: str) -> dict:
    """Delete a resume, promoting a replacement if it was the default.

    Returns the deleted row so the caller can clean up storage. The cached
    parse in `mock_interview_resume_profiles` cascades away with it; past
    sessions keep their history and have `resume_id` set to null, so
    deleting a resume never destroys an interview the candidate already sat.
    """
    resume = _owned_resume(supabase, user_id, resume_id)

    supabase.table("mock_interview_resumes").delete().eq("id", resume_id).execute()

    if resume.get("is_default"):
        remaining = list_resumes(supabase, user_id)
        if remaining:
            supabase.table("mock_interview_resumes").update({"is_default": True}).eq(
                "id", remaining[0]["id"]
            ).execute()

    return resume


def resolve(supabase, user_id: str, resume_id: str | None) -> dict:
    """The resume a new session should use: the one asked for, else the
    default, else the most recent.

    The last fallback matters -- `set_default` can leave a user with no
    default if it fails between its two statements, and a candidate should
    not be blocked from starting an interview by that.
    """
    if resume_id:
        return _owned_resume(supabase, user_id, resume_id)

    rows = (
        supabase.table("mock_interview_resumes")
        .select("*")
        .eq("user_id", user_id)
        .order("is_default", desc=True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not rows.data:
        raise ResumeNotFound("Upload a resume before starting an interview.")
    return rows.data[0]
