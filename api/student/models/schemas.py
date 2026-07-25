from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class QuestionReport(BaseModel):
    question_number: int
    question_text: str
    phase: str
    difficulty_tier: Optional[int] = None
    is_followup: bool = False
    # Present only for company-style questions served from the prep agent's
    # brief -- {source_count, source_urls, date_range, theme}. None means
    # resume-derived, and that distinction is shown to the candidate rather
    # than hidden.
    provenance: Optional[Dict[str, Any]] = None
    answer_text: Optional[str] = None
    audio_url: Optional[str] = None
    score: Optional[float] = None
    # Full relevance/specificity/depth/structure/evidence breakdown from
    # groq_service.evaluate_answer. `score` above is kept as a flat field for
    # simple display; `rubric` is the same evaluation in full.
    rubric: Optional[Dict[str, Any]] = None
    feedback: Optional[str] = None
    duration_seconds: Optional[float] = None
    wpm: Optional[float] = None

class FinalReportResponse(BaseModel):
    session_id: str
    target_role: Optional[str] = None
    company: Optional[str] = None
    questions: List[QuestionReport]
    # Delivery pace, not a score input -- see student/core/pace.py for why
    # this is framed as pace rather than "stress". None when no answer had a
    # usable duration.
    average_pace_wpm: Optional[float] = None
    pace_label: str
    overall_summary: str
    # Difficulty-weighted mean of scored answers. None when nothing in the
    # session could be scored -- previously this was a required float and
    # ReportService invented 5.0 to satisfy it.
    final_score: Optional[float] = None
    recommendation: str

class SessionStats(BaseModel):
    session_id: str
    created_at: str
    average_pace_wpm: Optional[float] = None
    average_answer_score: Optional[float] = None
    questions_attempted: int
    total_questions: int

class CategoryPerformance(BaseModel):
    average_score: float
    question_count: int

class UserSummaryResponse(BaseModel):
    mock_user_id: str
    total_sessions: int
    # ReportService builds each value as {"average_score": ..., "question_count": ...},
    # but this was declared Dict[str, float]. Pydantic rejected the dict on the way
    # out, so /interview/user-summary returned a 500 for every user who had ever
    # completed a session -- the empty-state path (no sessions -> {}) was the only
    # one that ever worked.
    weakest_phases: Dict[str, CategoryPerformance]
    progress_over_time: Dict[str, float]
