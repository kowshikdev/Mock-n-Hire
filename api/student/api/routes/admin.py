from fastapi import APIRouter, HTTPException, Depends
from student.api.dependencies import get_supabase
from student.api.auth import require_recruiter
import logging
from typing import List, Dict
import uuid

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/sessions")
async def get_all_sessions(supabase=Depends(get_supabase), current_user: dict = Depends(require_recruiter)) -> List[Dict]:
    """
    Retrieve all mock interview sessions with details: question count, answer count, average stress.
    Uses a single query if admin_get_session_overview() exists, else falls back to N queries.
    """
    try:
        # Try fast SQL function first
        try:
            data = supabase.rpc("admin_get_session_overview").execute().data
            if data is not None:
                logger.info(f"Retrieved {len(data)} sessions using admin_get_session_overview()")
                return data
        except Exception as e:
            logger.warning(f"admin_get_session_overview() RPC not found or failed, using slow fallback: {str(e)}")

        # SLOW fallback: manual enhancement (N+1 queries)
        sessions = supabase.table("mock_interview_sessions").select("*").order("start_time", desc=True).execute()
        if not sessions.data:
            logger.info("No sessions found")
            return []

        enhanced_sessions = []
        for session in sessions.data:
            session_id = session["id"]
            # Fetch question count
            questions = supabase.table("mock_interview_questions").select("id", count="exact").eq("session_id", session_id).execute()
            question_count = questions.count or 0

            # Fetch answer count
            answers = supabase.table("mock_interview_answers").select("id", count="exact").eq("session_id", session_id).execute()
            answer_count = answers.count or 0

            # Average speaking pace, from Whisper's own duration on each
            # answer (see student/core/pace.py) -- mock_interview_stress_analysis
            # is retired; nothing writes to it since the OpenCV-based stress.py
            # route was removed.
            answer_rows = supabase.table("mock_interview_answers").select("wpm").eq("session_id", session_id).execute()
            wpm_values = [a["wpm"] for a in (answer_rows.data or []) if a.get("wpm") is not None]
            average_pace_wpm = sum(wpm_values) / len(wpm_values) if wpm_values else None

            enhanced_session = {
                "id": session["id"],
                "user_id": session.get("user_id"),
                "resume_id": session.get("resume_id"),
                "start_time": session.get("start_time"),
                "end_time": session.get("end_time"),
                "status": session.get("status"),
                "overall_score": session.get("overall_score"),
                "question_count": question_count,
                "answer_count": answer_count,
                "average_pace_wpm": average_pace_wpm,
            }
            enhanced_sessions.append(enhanced_session)

        logger.info(f"Retrieved {len(enhanced_sessions)} sessions with enhanced details (fallback mode)")
        return enhanced_sessions

    except Exception as e:
        logger.error(f"Error retrieving sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving sessions: {str(e)}")


@router.delete("/session/{session_id}")
async def delete_session(session_id: str, supabase=Depends(get_supabase), current_user: dict = Depends(require_recruiter)):
    """
    Delete a specific session and its related data (questions, answers, stress analysis, reports, files).
    """
    try:
        try:
            uuid.UUID(session_id)
        except ValueError:
            logger.warning(f"Invalid session_id format: {session_id}")
            raise HTTPException(status_code=400, detail="Invalid session_id format. Must be a valid UUID.")

        # Check if the session exists
        session = supabase.table("mock_interview_sessions").select("id").eq("id", session_id).execute()
        if not session.data:
            logger.warning(f"Session {session_id} not found for deletion")
            raise HTTPException(status_code=404, detail="Session not found")

        logger.info(f"Session {session_id} found, proceeding with deletion")

        # Fetch audio files (for deletion)
        answers = supabase.table("mock_interview_answers").select("audio_url").eq("session_id", session_id).execute()
        audio_paths = [a.get("audio_url") for a in (answers.data or []) if a.get("audio_url")]

        # Fetch questions (for video deletion)
        questions = supabase.table("mock_interview_questions").select("question_number").eq("session_id", session_id).execute()
        question_numbers = [q["question_number"] for q in (questions.data or [])]

        # Delete related rows. mock_interview_stress_analysis is included for
        # sessions old enough to have rows there -- nothing writes to that
        # table anymore, but a session created before it was retired can
        # still have leftover rows that would otherwise never be cleaned up.
        supabase.table("mock_interview_questions").delete().eq("session_id", session_id).execute()
        supabase.table("mock_interview_answers").delete().eq("session_id", session_id).execute()
        supabase.table("mock_interview_stress_analysis").delete().eq("session_id", session_id).execute()
        supabase.table("mock_interview_reports").delete().eq("session_id", session_id).execute()

        # Delete session
        supabase.table("mock_interview_sessions").delete().eq("id", session_id).execute()

        # Delete audio files
        for audio_path in audio_paths:
            try:
                supabase.storage.from_("mock.interview.answers").remove([audio_path])
                logger.info(f"Deleted audio file: {audio_path}")
            except Exception as e:
                logger.warning(f"Failed to delete audio file {audio_path}: {str(e)}")

        # Delete video files
        for q_num in question_numbers:
            video_path = f"videos/{session_id}/{q_num}/video.webm"
            try:
                supabase.storage.from_("mock.interview.videos").remove([video_path])
                logger.info(f"Deleted video file: {video_path}")
            except Exception as e:
                logger.warning(f"Failed to delete video file {video_path}: {str(e)}")

        logger.info(f"Deleted session {session_id}")
        return {"status": "Session deleted", "session_id": session_id}

    except Exception as e:
        logger.error(f"Error deleting session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")
