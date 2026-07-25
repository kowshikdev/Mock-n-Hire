from pydantic import BaseModel
from typing import List, Optional, Dict

class QuestionReport(BaseModel):
    question_number: int
    question_text: str
    category: str
    answer_text: Optional[str] = None
    audio_url: Optional[str] = None
    score: Optional[float] = None
    feedback: Optional[str] = None
    stress_score: Optional[float] = None
    stress_level: Optional[str] = None

class FinalReportResponse(BaseModel):
    session_id: str
    questions: List[QuestionReport]
    average_stress: float
    average_stress_level: str
    overall_summary: str
    # None when no answer in the session could be scored. Previously this was
    # a required float and ReportService invented 5.0 to satisfy it.
    final_score: Optional[float] = None
    recommendation: str

class SessionStats(BaseModel):
    session_id: str
    created_at: str
    average_stress: float
    average_answer_score: Optional[float] = None
    questions_attempted: int
    total_questions: int

class CategoryPerformance(BaseModel):
    average_score: float
    question_count: int

class UserSummaryResponse(BaseModel):
    mock_user_id: str
    total_sessions: int
    average_stress_trend: List[float]
    # ReportService builds each value as {"average_score": ..., "question_count": ...},
    # but this was declared Dict[str, float]. Pydantic rejected the dict on the way
    # out, so /interview/user-summary returned a 500 for every user who had ever
    # completed a session -- the empty-state path (no sessions -> {}) was the only
    # one that ever worked.
    weakest_question_types: Dict[str, CategoryPerformance]
    progress_over_time: Dict[str, float]