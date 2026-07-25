from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Body, File, UploadFile
from pydantic import BaseModel, Field
from student.api.dependencies import (
    get_supabase,
    get_groq_service,
    get_whisper_service,
    get_report_service,
    get_resume_parser,
)
from student.api.auth import get_current_user, require_self, require_session_owner
from student.utils.supabase_utils import upload_file, download_file, remove_file
from resume_text import extract_resume_text, UnreadableResume, SUPPORTED_EXTENSIONS
from student.core import resume_library
from student.core.resume_parser import profile_to_prompt_context
from student.core.session_planner import (
    build_plan,
    expected_question_counts,
    next_slot,
    phase_remaining_seconds,
    progress_fraction,
    AskedQuestion,
    GRACE_FACTOR,
    OPENING_QUESTION,
)
from student.core import difficulty
from student.core.prep_service import start_prep
from student.core.pace import words_per_minute
from student.models.schemas import FinalReportResponse, UserSummaryResponse
import os
import tempfile
from datetime import datetime, timezone
import logging
import uuid
import asyncio

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interview", tags=["interview"])


@router.get("/")
async def root():
    return {
        "message": "Mock Interview Backend",
        "supabase_url": os.getenv("SUPABASE_URL")
    }


@router.get("/test-supabase")
async def test_supabase(supabase=Depends(get_supabase), current_user: dict = Depends(get_current_user)):
    try:
        valid_user_id = "386b7b8e-6242-424f-aad8-9e02ae93678e"
        response = supabase.table("mock_interview_users").upsert({
            "user_id": valid_user_id,
            "role": "candidate"
        }, on_conflict="user_id").execute()
        logger.info(f"Supabase test successful for user_id: {valid_user_id}")
        return {"status": "Supabase connected", "data": response.data}
    except Exception as e:
        logger.error(f"Supabase test failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Supabase error: {str(e)}")


def _parse_profile_in_background(resume_parser, resume_id: str, resume_text: str) -> None:
    """Warm the resume-profile cache right after upload.

    Parsing is a multi-second LLM pass. Doing it here means starting an
    interview later is a cache hit rather than a download plus a parse on the
    critical path, and the candidate is typing a role and duration while it
    runs. Failures are swallowed: `create_session` still has the parse path,
    so the worst case is the latency this exists to avoid, not a broken
    upload.
    """
    try:
        resume_parser.get_profile(resume_id, resume_text)
        logger.info(f"Resume profile warmed for {resume_id}")
    except Exception as e:
        logger.warning(f"Background resume parse failed for {resume_id}: {e}")


@router.post("/upload-resume/{mock_user_id}")
async def upload_resume(
    mock_user_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    supabase=Depends(get_supabase),
    resume_parser=Depends(get_resume_parser),
    current_user: dict = Depends(require_self),
):
    try:
        try:
            uuid.UUID(mock_user_id)
        except ValueError:
            logger.warning(f"Invalid mock_user_id format: {mock_user_id}")
            raise HTTPException(status_code=400, detail="Invalid mock_user_id format. Must be a valid UUID.")

        try:
            logger.info(f"Upserting user {mock_user_id} into mock_interview_users")
            supabase.table("mock_interview_users").upsert({
                "user_id": mock_user_id,
                "role": "student"
            }, on_conflict="user_id").execute()
        except Exception as e:
            logger.error(f"Failed to upsert user {mock_user_id}: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to ensure user exists in system")

        if not (file.filename or "").lower().endswith(SUPPORTED_EXTENSIONS):
            logger.warning(f"Invalid file format for user {mock_user_id}: {file.filename}")
            raise HTTPException(status_code=400, detail="Please upload a PDF or DOCX resume.")

        file_content = file.file.read()
        try:
            resume_text = extract_resume_text(file_content, file.filename)
        except UnreadableResume as e:
            raise HTTPException(status_code=422, detail=str(e))

        # Checked before the upload, not after: storing the object first and
        # then rejecting the row would leave an orphan in the bucket that
        # nothing references and nothing cleans up.
        existing = resume_library.list_resumes(supabase, mock_user_id)
        if len(existing) >= resume_library.MAX_RESUMES:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": f"You can keep up to {resume_library.MAX_RESUMES} resumes. "
                               "Delete one before uploading another.",
                    "resumes": existing,
                },
            )

        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        base_filename = file.filename.rsplit(".", 1)[0]
        file_extension = file.filename.rsplit(".", 1)[1]
        unique_filename = f"{base_filename}_{timestamp}.{file_extension}"
        file_path = f"{mock_user_id}/{unique_filename}"
        upload_file("mock.interview.resumes", file_path, file_content)

        try:
            resume = resume_library.register_upload(
                supabase, mock_user_id, file_path, file.filename
            )
        except resume_library.ResumeLimitReached as e:
            # Lost a race with a concurrent upload between the check above and
            # here. The object is already in storage, so remove it rather than
            # leaving it orphaned.
            try:
                remove_file("mock.interview.resumes", file_path)
            except Exception as cleanup_error:
                logger.warning(f"Could not clean up {file_path} after limit race: {cleanup_error}")
            raise HTTPException(status_code=409, detail={"message": str(e), "resumes": e.resumes})

        background_tasks.add_task(
            _parse_profile_in_background, resume_parser, resume["id"], resume_text
        )

        logger.info(f"Resume uploaded for user {mock_user_id}: {file_path}, resume_id: {resume['id']}")
        return {
            "status": "Resume uploaded",
            "resume_id": resume["id"],
            "user_id": mock_user_id,
            "file_name": resume["file_name"],
            "is_default": resume["is_default"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading resume for user {mock_user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error uploading resume: {str(e)}")


# --------------------------------------------------------------------- #
# Resume library. A candidate keeps up to three resumes and picks a default,
# so starting an interview no longer requires uploading the same CV again.
# --------------------------------------------------------------------- #


@router.get("/resumes")
async def get_resumes(supabase=Depends(get_supabase), current_user: dict = Depends(get_current_user)):
    return {
        "resumes": resume_library.list_resumes(supabase, current_user["user_id"]),
        "max_resumes": resume_library.MAX_RESUMES,
    }


@router.patch("/resumes/{resume_id}/default")
async def set_default_resume(
    resume_id: str,
    supabase=Depends(get_supabase),
    current_user: dict = Depends(get_current_user),
):
    try:
        uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid resume_id format.")
    try:
        resume_library.set_default(supabase, current_user["user_id"], resume_id)
    except resume_library.ResumeNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"resumes": resume_library.list_resumes(supabase, current_user["user_id"])}


@router.delete("/resumes/{resume_id}")
async def delete_resume(
    resume_id: str,
    supabase=Depends(get_supabase),
    current_user: dict = Depends(get_current_user),
):
    try:
        uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid resume_id format.")
    try:
        deleted = resume_library.delete_resume(supabase, current_user["user_id"], resume_id)
    except resume_library.ResumeNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Storage is cleaned up after the row is gone, and a failure here is
    # logged rather than raised: the candidate's library is already correct,
    # and failing the request would imply otherwise.
    try:
        remove_file("mock.interview.resumes", deleted["file_path"])
    except Exception as e:
        logger.warning(f"Deleted resume row {resume_id} but could not remove {deleted['file_path']}: {e}")

    return {"resumes": resume_library.list_resumes(supabase, current_user["user_id"])}


# --------------------------------------------------------------------- #
# Duration-driven sessions. Replaces the old fixed-nine-questions flow --
# generate-questions/next-question/submit-answer are gone. A session's
# question count is no longer known in advance, so there is no longer a
# batch to generate; questions are created one at a time, just in time.
# See INTERVIEW_ARCHITECTURE.md.
# --------------------------------------------------------------------- #

class CreateSessionRequest(BaseModel):
    # Optional: falls back to the candidate's default resume, so a repeat
    # session needs nothing but a role.
    resume_id: str | None = None
    target_role: str
    company: str | None = None
    # Optional, and the strongest grounding signal there is when present -- a
    # role title implies a stack, a posting names it. See
    # groq_service.analyse_fit.
    job_description: str | None = None
    duration_minutes: int = Field(ge=10, le=60)


class AnswerRequest(BaseModel):
    # The candidate chose to move on without recording. Distinguishes an
    # intentional skip from a failed upload for logging purposes only --
    # both end up treated as "no answer was given" (see
    # _download_answer_audio), so this doesn't change the response shape.
    skip: bool = False


def _serialise_question(row: dict, is_followup: bool = False) -> dict:
    return {
        "question_id": row["id"],
        # The storage path the frontend uploads audio/video to is keyed by
        # question_number, not question_id -- this has to be in the response
        # or the client has no way to construct the same path the backend
        # will look for the recording under.
        "question_number": row["question_number"],
        "question": row["question_text"],
        "phase": row["phase"],
        "time_budget_seconds": row["time_budget_seconds"],
        "is_followup": is_followup,
        "provenance": row.get("provenance"),
    }


def _asked_questions(rows: list[dict]) -> list[AskedQuestion]:
    def parse(ts):
        return datetime.fromisoformat(ts) if ts else None

    return [
        AskedQuestion(
            phase=row["phase"] or "warmup",
            time_budget_seconds=row["time_budget_seconds"] or 120,
            asked_at=parse(row["asked_at"]) or datetime.now(timezone.utc),
            answered_at=parse(row["answered_at"]),
        )
        for row in rows
    ]


async def _download_answer_audio(session_id: str, question_number: int) -> bytes | None:
    """Retry-download the audio the frontend already uploaded to storage for
    this question, tolerating the small window between the upload finishing
    client-side and it being readable from storage.

    Returns None -- never raises -- when nothing is found. A question can go
    unanswered two ways: the candidate explicitly skips it (see the `skip`
    flag on AnswerRequest below), or an upload genuinely failed client-side.
    Both should degrade to "no answer was given", the same path
    groq_service.evaluate_answer already has for an empty transcript, rather
    than a 404 that strands the whole session.
    """
    audio_path = f"answers/{session_id}/{question_number}/audio.webm"
    max_retries = 2
    delay_between_retries = 3

    for attempt in range(1, max_retries + 2):
        try:
            return download_file("mock.interview.answers", audio_path)
        except Exception as e:
            logger.warning(f"Audio not found on attempt {attempt} at {audio_path}: {e}")
            if attempt <= max_retries:
                await asyncio.sleep(delay_between_retries)

    return None


@router.post("/sessions")
async def create_session(
    payload: CreateSessionRequest,
    background_tasks: BackgroundTasks,
    supabase=Depends(get_supabase),
    groq_service=Depends(get_groq_service),
    resume_parser=Depends(get_resume_parser),
    current_user: dict = Depends(get_current_user),
):
    try:
        if payload.resume_id:
            try:
                uuid.UUID(payload.resume_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid resume_id format.")

        try:
            resume = resume_library.resolve(supabase, current_user["user_id"], payload.resume_id)
        except resume_library.ResumeNotFound as e:
            raise HTTPException(status_code=404, detail=str(e))

        file_path = resume["file_path"]
        # Normally a cache hit: the profile is parsed in the background when
        # the resume is uploaded, so by the time anyone starts an interview
        # this costs one SELECT rather than a download plus an LLM pass. The
        # slow path still exists for resumes uploaded before that, and for
        # the case where someone uploads and immediately starts.
        profile = resume_parser.read_cached_profile(resume["id"])
        if profile is None:
            file_bytes = download_file("mock.interview.resumes", file_path)
            try:
                resume_text = extract_resume_text(file_bytes, file_path)
            except UnreadableResume as e:
                raise HTTPException(status_code=422, detail=str(e))
            profile = resume_parser.get_profile(resume["id"], resume_text)

        duration_seconds = payload.duration_minutes * 60
        plan = build_plan(duration_seconds)
        diff_state = difficulty.initial_state(profile.get("seniority_signal"))

        session_response = supabase.table("mock_interview_sessions").insert({
            "user_id": current_user["user_id"],
            "resume_id": resume["id"],
            "target_role": payload.target_role,
            "company": payload.company,
            "job_description": (payload.job_description or "").strip() or None,
            "duration_seconds": duration_seconds,
            "plan": plan,
            "difficulty_tier": diff_state.tier,
            "difficulty_streak": diff_state.streak,
        }).execute()
        session_id = session_response.data[0]["id"]

        # The brief row must exist before the background task can update it --
        # created here, in the request that owns the transaction, not inside
        # the task itself.
        supabase.table("mock_interview_briefs").insert({
            "session_id": session_id,
            "status": "pending",
        }).execute()

        # Warm-up is a fixed opener and closing is generic, so neither needs
        # researching -- only the phases that draw on the bank are sized.
        targets = {
            phase: count
            for phase, count in expected_question_counts(plan).items()
            if phase in ("technical", "behavioral", "situational")
        }
        background_tasks.add_task(
            start_prep,
            supabase, groq_service, session_id, profile,
            payload.target_role, payload.company,
            (payload.job_description or "").strip() or None,
            targets,
        )

        # No LLM call: the opener is a constant, so the interview begins the
        # moment this row is written rather than after a round trip to Groq
        # for a question that needed no thought. See session_planner.
        warmup_budget = plan[0]["question_time_budget"]
        now = datetime.now(timezone.utc)

        question_response = supabase.table("mock_interview_questions").insert({
            "session_id": session_id,
            "question_text": OPENING_QUESTION,
            "category": "warmup",
            "question_number": 1,
            "is_answered": False,
            "phase": "warmup",
            "difficulty_tier": diff_state.tier,
            "time_budget_seconds": warmup_budget,
            "asked_at": now.isoformat(),
        }).execute()

        logger.info(f"Session {session_id} created for user {current_user['user_id']}, duration={duration_seconds}s")
        return {
            "session_id": session_id,
            "duration_seconds": duration_seconds,
            "progress": 0.0,
            **_serialise_question(question_response.data[0]),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating session: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating session: {str(e)}")


@router.get("/sessions/{session_id}/state")
async def get_session_state(
    session_id: str,
    supabase=Depends(get_supabase),
    current_user: dict = Depends(require_session_owner),
):
    try:
        try:
            uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session_id format.")

        session_row = supabase.table("mock_interview_sessions").select("*").eq("id", session_id).limit(1).execute()
        if not session_row.data:
            raise HTTPException(status_code=404, detail="Session not found")
        session = session_row.data[0]

        if session["status"] != "in_progress":
            return {"status": session["status"], "question_id": None, "question": None, "done": True}

        open_question = (
            supabase.table("mock_interview_questions")
            .select("*")
            .eq("session_id", session_id)
            .eq("is_answered", False)
            .order("question_number", desc=True)
            .limit(1)
            .execute()
        )
        if not open_question.data:
            return {"status": session["status"], "question_id": None, "question": None, "done": False}

        now = datetime.now(timezone.utc)
        start = datetime.fromisoformat(session["start_time"])
        elapsed = (now - start).total_seconds()

        return {
            "status": session["status"],
            "progress": min(1.0, max(0.0, elapsed / session["duration_seconds"])),
            "seconds_remaining": max(0.0, session["duration_seconds"] - elapsed),
            **_serialise_question(
                open_question.data[0],
                is_followup=open_question.data[0].get("parent_question_id") is not None,
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading session state for {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error reading session state: {str(e)}")


@router.post("/sessions/{session_id}/answer")
async def submit_session_answer(
    session_id: str,
    payload: AnswerRequest = Body(default=AnswerRequest()),
    supabase=Depends(get_supabase),
    groq_service=Depends(get_groq_service),
    whisper_service=Depends(get_whisper_service),
    current_user: dict = Depends(require_session_owner),
):
    try:
        try:
            uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session_id format.")

        session_row = supabase.table("mock_interview_sessions").select("*").eq("id", session_id).limit(1).execute()
        if not session_row.data:
            raise HTTPException(status_code=404, detail="Session not found")
        session = session_row.data[0]
        if session["status"] != "in_progress":
            raise HTTPException(status_code=409, detail="This session has already ended.")

        open_question = (
            supabase.table("mock_interview_questions")
            .select("*")
            .eq("session_id", session_id)
            .eq("is_answered", False)
            .order("question_number", desc=True)
            .limit(1)
            .execute()
        )
        if not open_question.data:
            raise HTTPException(status_code=409, detail="No open question for this session.")
        question = open_question.data[0]

        answer_text = ""
        audio_duration = None
        if not payload.skip:
            audio_bytes = await _download_answer_audio(session_id, question["question_number"])
            if audio_bytes is not None:
                with tempfile.TemporaryDirectory() as tmp:
                    audio_path_local = os.path.join(tmp, "answer.webm")
                    with open(audio_path_local, "wb") as f:
                        f.write(audio_bytes)
                    answer_text, audio_duration = whisper_service.transcribe(audio_path_local)
            else:
                logger.info(f"No audio found for session {session_id} Q{question['question_number']}; treating as unanswered")

        wpm = words_per_minute(answer_text, audio_duration)

        is_followup = question.get("parent_question_id") is not None
        followups_used = 0
        if not is_followup:
            existing_followups = (
                supabase.table("mock_interview_questions")
                .select("id", count="exact")
                .eq("parent_question_id", question["id"])
                .execute()
            )
            followups_used = existing_followups.count or 0

        rubric = groq_service.evaluate_answer(
            question["question_text"], answer_text, question["phase"], followups_used, is_followup,
        )

        now = datetime.now(timezone.utc)
        storage_audio_path = (
            f"answers/{session_id}/{question['question_number']}/audio.webm" if answer_text else None
        )

        supabase.table("mock_interview_answers").upsert({
            "session_id": session_id,
            "question_number": question["question_number"],
            "answer_text": answer_text,
            "audio_url": storage_audio_path,
            "score": rubric["score"],
            "feedback": rubric["feedback"],
            "rubric": rubric,
            "duration_seconds": audio_duration,
            "wpm": wpm,
        }, on_conflict="session_id,question_number").execute()

        supabase.table("mock_interview_questions").update({
            "is_answered": True,
            "answered_at": now.isoformat(),
        }).eq("id", question["id"]).execute()

        diff_state = difficulty.update(
            difficulty.DifficultyState(tier=session["difficulty_tier"], streak=session["difficulty_streak"]),
            rubric["score"],
        )
        if diff_state.tier != session["difficulty_tier"] or diff_state.streak != session["difficulty_streak"]:
            supabase.table("mock_interview_sessions").update({
                "difficulty_tier": diff_state.tier,
                "difficulty_streak": diff_state.streak,
            }).eq("id", session_id).execute()

        all_questions = supabase.table("mock_interview_questions").select("*").eq("session_id", session_id).execute().data
        asked = _asked_questions(all_questions)
        plan = session["plan"]
        start = datetime.fromisoformat(session["start_time"])
        next_number = max(q["question_number"] for q in all_questions) + 1

        next_payload = None
        done = False

        session_past_hard_stop = (now - start).total_seconds() >= session["duration_seconds"] * GRACE_FACTOR

        if rubric["followup_recommended"] and rubric["followup_question"] and not session_past_hard_stop:
            remaining = phase_remaining_seconds(plan, asked, question["phase"])
            # A follow-up needs at least half a minute to be worth asking --
            # anything shorter and the phase is effectively already over.
            # Phase budgets are fractions of the total duration, so this
            # rarely diverges from the session-wide hard stop above -- the
            # check exists for the rounding edge case where it does.
            if remaining >= 30:
                followup_budget = int(min(90, max(30, remaining)))
                fq = supabase.table("mock_interview_questions").insert({
                    "session_id": session_id,
                    "question_text": rubric["followup_question"],
                    "category": question["phase"],
                    "question_number": next_number,
                    "is_answered": False,
                    "parent_question_id": question["id"],
                    "phase": question["phase"],
                    "difficulty_tier": diff_state.tier,
                    "time_budget_seconds": followup_budget,
                    "asked_at": now.isoformat(),
                }).execute()
                next_payload = _serialise_question(fq.data[0], is_followup=True)

        if next_payload is None:
            slot = next_slot(plan, asked, start, now, session["duration_seconds"])
            if slot is None:
                supabase.table("mock_interview_sessions").update({
                    "status": "completed",
                    "end_time": now.isoformat(),
                }).eq("id", session_id).execute()
                done = True
            else:
                brief_row = _read_brief(supabase, session_id)
                seed = _pick_seed(brief_row, slot.phase, diff_state.tier, all_questions)
                # Only consulted when nothing was prepared for this phase --
                # a prepared question is already targeted, and steering it
                # again would just cost a generation call for no gain.
                focus_area = None if seed else _pick_focus_area(brief_row, all_questions)

                profile_row = (
                    supabase.table("mock_interview_resume_profiles")
                    .select("profile")
                    .eq("resume_id", session["resume_id"])
                    .limit(1)
                    .execute()
                )
                profile = profile_row.data[0]["profile"] if profile_row.data else {}
                candidate_context = profile_to_prompt_context(profile)
                asked_texts = [q["question_text"] for q in all_questions]

                generated = groq_service.generate_next_question(
                    candidate_context, session["target_role"], slot.phase, diff_state.tier,
                    asked_texts, seed, focus_area,
                )
                nq = supabase.table("mock_interview_questions").insert({
                    "session_id": session_id,
                    "question_text": generated["text"],
                    "category": slot.phase,
                    "question_number": next_number,
                    "is_answered": False,
                    "phase": slot.phase,
                    "difficulty_tier": diff_state.tier,
                    "time_budget_seconds": slot.time_budget_seconds,
                    "provenance": generated.get("provenance"),
                    "asked_at": now.isoformat(),
                }).execute()
                next_payload = _serialise_question(nq.data[0])

        logger.info(f"Answer submitted for session {session_id}, question {question['question_number']}. Score: {rubric['score']}")
        return {
            "evaluation": {
                k: rubric[k]
                for k in ("score", "feedback", "relevance", "specificity", "depth", "structure", "evidence_quotes", "gaps")
            },
            "next": next_payload,
            "done": done,
            "progress": progress_fraction(plan, asked, start, now, session["duration_seconds"]),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting answer for session {session_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error submitting answer: {str(e)}")


def _read_brief(supabase, session_id: str) -> dict:
    """The session's prep row. Read once per turn and shared by the seed and
    focus-area pickers, rather than each fetching it separately."""
    rows = (
        supabase.table("mock_interview_briefs")
        .select("status,brief,question_bank")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )
    return rows.data[0] if rows.data else {}


def _pick_seed(brief_row: dict, phase: str, difficulty_tier: int, asked_questions: list[dict]) -> dict | None:
    """Pull a matching, unused question from the prepared bank.

    Serving a prepared question costs no LLM call at all, which is what keeps
    the gap between a candidate finishing an answer and hearing the next
    question near-instant. Generation is now the *fallback*, not the norm.

    Two things changed from the original: the bank covers every researched
    phase rather than technical only (behavioral questions grounded in what a
    company actually asks are no less useful than technical ones), and it is
    used whenever prep is ready rather than only when `grounded` is true --
    a JD-grounded bank with no external sources is still a better question
    than an unguided one. `grounded` now only decides whether the candidate
    sees the "company-style" provenance note.
    """
    if brief_row.get("status") != "ready":
        return None

    asked_texts = {q["question_text"].strip().lower() for q in asked_questions}
    candidates = [
        seed for seed in (brief_row.get("question_bank") or [])
        if seed.get("phase", "technical") == phase
        and (seed.get("text") or "").strip().lower() not in asked_texts
    ]
    if not candidates:
        return None

    tier_name = difficulty.TIER_INFO.get(difficulty_tier, {}).get("name")
    exact_tier = [s for s in candidates if s.get("difficulty_hint") == tier_name]
    return (exact_tier or candidates)[0]


def _pick_focus_area(brief_row: dict, asked_questions: list[dict]) -> dict | None:
    """The next resume-vs-JD gap worth probing, if any are left unprobed.

    Used when the bank has nothing for this phase, so a generated question
    still aims at something specific to this candidate and this posting
    rather than at the role in general. Gaps are preferred over strengths --
    an interview learns more from what the resume does not evidence.
    """
    areas = (brief_row.get("brief") or {}).get("focus_areas") or []
    if not areas:
        return None

    probed = {
        (q.get("provenance") or {}).get("theme")
        for q in asked_questions
        if q.get("provenance")
    }
    pool = [a for a in areas if a["topic"] not in probed] or areas
    gaps = [a for a in pool if a["status"] == "gap"]
    partials = [a for a in pool if a["status"] == "partial"]
    return (gaps or partials or pool)[0]


@router.post("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    supabase=Depends(get_supabase),
    current_user: dict = Depends(require_session_owner),
):
    try:
        try:
            uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session_id format.")

        session_row = supabase.table("mock_interview_sessions").select("status").eq("id", session_id).limit(1).execute()
        if not session_row.data:
            raise HTTPException(status_code=404, detail="Session not found")

        if session_row.data[0]["status"] == "in_progress":
            supabase.table("mock_interview_sessions").update({
                "status": "abandoned",
                "end_time": datetime.now(timezone.utc).isoformat(),
            }).eq("id", session_id).execute()

        return {"status": "ended"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ending session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error ending session: {str(e)}")


@router.get("/sessions/{session_id}/report", response_model=FinalReportResponse)
async def get_session_report(
    session_id: str,
    report_service=Depends(get_report_service),
    current_user: dict = Depends(require_session_owner),
):
    try:
        try:
            uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session_id format.")

        logger.info(f"Generating report for session {session_id}")
        report = report_service.generate_final_report(session_id)
        return report
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating report for session {session_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")


@router.get("/user-summary/{mock_user_id}", response_model=UserSummaryResponse)
async def get_user_summary(mock_user_id: str, report_service=Depends(get_report_service), current_user: dict = Depends(require_self)):
    try:
        try:
            uuid.UUID(mock_user_id)
        except ValueError:
            logger.warning(f"Invalid mock_user_id format: {mock_user_id}")
            raise HTTPException(status_code=400, detail="Invalid mock_user_id format. Must be a valid UUID.")

        logger.info(f"Generating user summary for user {mock_user_id}")
        summary = report_service.generate_user_summary(mock_user_id)
        logger.info(f"User summary generated for user {mock_user_id}")
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating user summary for user {mock_user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating user summary: {str(e)}")
