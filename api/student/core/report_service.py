import logging
import uuid
from datetime import datetime
from typing import List

from student.config.settings import settings
from student.core.pace import pace_label
from student.models.schemas import (
    CategoryPerformance,
    FinalReportResponse,
    QuestionReport,
    UserSummaryResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _phase_of(row: dict) -> str:
    """`phase` for sessions built on the new duration-driven loop, falling
    back to the old `category` field (technical/hr/situational/surprise) for
    any session created before that migration -- so a report for an
    older session still renders instead of showing a blank phase."""
    return row.get("phase") or row.get("category") or "general"


class ReportService:
    def __init__(self, supabase, groq_service):
        self.supabase = supabase
        self.groq_service = groq_service

    def generate_final_report(self, session_id: str) -> FinalReportResponse:
        logger.info(f"Generating final report for session_id: {session_id}")
        try:
            try:
                uuid.UUID(session_id)
            except ValueError:
                raise ValueError("Invalid session_id format. Must be a valid UUID.")

            session_row = self.supabase.table("mock_interview_sessions").select(
                "*, user_id:mock_interview_users(user_id:users(user_id, name, email, role))"
            ).eq("id", session_id).execute()
            if not session_row.data:
                raise Exception(f"No session found with session_id: {session_id}")
            session = session_row.data[0]
            # The alias nests twice: session["user_id"] is the embedded
            # mock_interview_users row, which itself only has (user_id, role)
            # -- name/email live on `users`, reached through the row's OWN
            # user_id alias one level deeper. Reading session["user_id"]["name"]
            # (one level too shallow) always fell through to "Unknown User"
            # silently, in every report this service ever generated.
            mock_user_row = session.get("user_id") or {}
            user_data = mock_user_row.get("user_id") or {}
            user_name = user_data.get("name") or "Unknown User"

            questions = self.supabase.table("mock_interview_questions").select("*").eq(
                "session_id", session_id
            ).order("question_number").execute().data or []
            if not questions:
                raise Exception(f"No questions found for session_id: {session_id}")

            answers = self.supabase.table("mock_interview_answers").select("*").eq(
                "session_id", session_id
            ).execute().data or []
            answers_by_number = {a["question_number"]: a for a in answers}

            question_reports: List[QuestionReport] = []
            weighted_score_sum = 0.0
            weight_sum = 0.0
            wpm_values: list[float] = []

            for question in questions:
                number = question["question_number"]
                answer = answers_by_number.get(number, {})
                score = answer.get("score")
                tier = question.get("difficulty_tier") or 1

                question_reports.append(QuestionReport(
                    question_number=number,
                    question_text=question["question_text"],
                    phase=_phase_of(question),
                    difficulty_tier=question.get("difficulty_tier"),
                    is_followup=question.get("parent_question_id") is not None,
                    provenance=question.get("provenance"),
                    answer_text=answer.get("answer_text"),
                    audio_url=answer.get("audio_url"),
                    score=score,
                    rubric=answer.get("rubric"),
                    feedback=answer.get("feedback"),
                    duration_seconds=answer.get("duration_seconds"),
                    wpm=answer.get("wpm"),
                ))

                # Harder questions carry more weight -- a 7/10 at expert tier
                # reflects more than a 9/10 at foundational. Unanswered
                # questions are excluded entirely rather than scored as 0,
                # same principle as the plain-mean version this replaces.
                if score is not None:
                    weighted_score_sum += score * tier
                    weight_sum += tier
                if answer.get("wpm") is not None:
                    wpm_values.append(answer["wpm"])

            final_score = (weighted_score_sum / weight_sum) if weight_sum > 0 else None
            average_wpm = (sum(wpm_values) / len(wpm_values)) if wpm_values else None
            answered_count = sum(1 for a in answers if a.get("answer_text"))

            logger.info(
                f"Final score for session {session_id}: {final_score} "
                f"(difficulty-weighted over {int(weight_sum)} tier-weight)"
            )

            score_line = (
                f"{final_score:.1f} out of 10 (difficulty-weighted)"
                if final_score is not None
                else "not scored -- no answers were recorded"
            )

            # Evidence and gaps the rubric already extracted, so the summary
            # can cite specifics instead of restating scores in prose.
            evidence_lines = []
            for qr in question_reports:
                if not qr.rubric:
                    continue
                quotes = qr.rubric.get("evidence_quotes") or []
                gaps = qr.rubric.get("gaps") or []
                if quotes:
                    evidence_lines.append(f"- Q{qr.question_number} ({qr.phase}) said: " + "; ".join(quotes))
                if gaps:
                    evidence_lines.append(f"- Q{qr.question_number} ({qr.phase}) gap: " + "; ".join(gaps))

            session_facts = f"""Candidate: {user_name}
Target role: {session.get('target_role') or 'unspecified'}
Questions asked: {len(questions)}
Questions answered: {answered_count}
Overall score: {score_line}

Per-question evidence:
{chr(10).join(evidence_lines) if evidence_lines else "(no rubric evidence recorded)"}"""

            summary_prompt = f"""Summarise this mock interview for the candidate, speaking to them directly.

{session_facts}

Write 2-3 sentences on how they did, citing specific evidence above rather
than restating the score. Do not invent detail that isn't in the evidence."""

            recommendation_prompt = f"""Give this candidate one actionable thing to work on before their next interview.

{session_facts}

Write 1-2 sentences, addressed to them, about answer quality -- grounded in
a specific gap from the evidence above, not a generic tip."""

            overall_summary = f"{user_name} answered {answered_count} of {len(questions)} questions, scoring {score_line}."
            try:
                completion = self.groq_service.client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": "You are a helpful AI assistant that summarizes interview performance."},
                        {"role": "user", "content": summary_prompt},
                    ],
                    model=settings.LLM_MODEL,
                    max_tokens=200,
                    temperature=0.7,
                )
                overall_summary = completion.choices[0].message.content.strip()
            except Exception as e:
                logger.error(f"Failed to generate summary via Groq API: {e}")

            if final_score is None:
                recommendation = "Run the interview again and answer out loud so there's something to review."
            elif final_score < 6:
                recommendation = "Work on structure: state the situation, what you did, and the result, with concrete detail in each."
            else:
                recommendation = "Keep practising, and push for more specific evidence -- numbers, tools, outcomes -- in each answer."
            try:
                completion = self.groq_service.client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": "You are a helpful AI assistant that provides interview recommendations."},
                        {"role": "user", "content": recommendation_prompt},
                    ],
                    model=settings.LLM_MODEL,
                    max_tokens=150,
                    temperature=0.7,
                )
                recommendation = completion.choices[0].message.content.strip()
            except Exception as e:
                logger.error(f"Failed to generate recommendation via Groq API: {e}")

            self.supabase.table("mock_interview_reports").upsert({
                "session_id": session_id,
                "overall_summary": overall_summary,
                "final_score": final_score,
                "recommendation": recommendation,
                "created_at": datetime.utcnow().isoformat(),
            }, on_conflict=["session_id"]).execute()

            return FinalReportResponse(
                session_id=session_id,
                target_role=session.get("target_role"),
                company=session.get("company"),
                questions=question_reports,
                average_pace_wpm=average_wpm,
                pace_label=pace_label(average_wpm),
                overall_summary=overall_summary,
                final_score=final_score,
                recommendation=recommendation,
            )

        except Exception as e:
            logger.error(f"Failed to generate final report for session_id {session_id}: {e}", exc_info=True)
            raise Exception(f"Failed to generate final report: {e}")

    def generate_user_summary(self, mock_user_id: str) -> UserSummaryResponse:
        """Summary of a user's interview performance across all sessions."""
        logger.info(f"Generating user summary for mock_user_id: {mock_user_id}")
        try:
            try:
                uuid.UUID(mock_user_id)
            except ValueError:
                raise ValueError("Invalid mock_user_id format. Must be a valid UUID.")

            sessions = self.supabase.table("mock_interview_sessions").select("*").eq(
                "user_id", mock_user_id
            ).order("start_time").execute().data or []

            if not sessions:
                return UserSummaryResponse(
                    mock_user_id=mock_user_id, total_sessions=0,
                    weakest_phases={}, progress_over_time={},
                )

            phase_totals: dict[str, dict[str, float]] = {}
            answer_score_trend: list[float] = []

            for session in sessions:
                session_id = session["id"]

                questions = self.supabase.table("mock_interview_questions").select("*").eq(
                    "session_id", session_id
                ).execute().data or []
                answers = self.supabase.table("mock_interview_answers").select("*").eq(
                    "session_id", session_id
                ).execute().data or []
                answers_by_number = {a["question_number"]: a for a in answers}

                scores_this_session = [a["score"] for a in answers if a.get("score") is not None]
                if scores_this_session:
                    answer_score_trend.append(sum(scores_this_session) / len(scores_this_session))

                for question in questions:
                    answer = answers_by_number.get(question["question_number"])
                    if not answer or answer.get("score") is None:
                        continue
                    phase = _phase_of(question)
                    bucket = phase_totals.setdefault(phase, {"total_score": 0.0, "count": 0})
                    bucket["total_score"] += answer["score"]
                    bucket["count"] += 1

            weakest_phases = {
                phase: CategoryPerformance(
                    average_score=data["total_score"] / data["count"],
                    question_count=int(data["count"]),
                )
                for phase, data in phase_totals.items()
            }

            progress = {
                "answer_score_improvement": (
                    answer_score_trend[-1] - answer_score_trend[0]
                    if len(answer_score_trend) > 1 else 0.0
                ),
            }

            return UserSummaryResponse(
                mock_user_id=mock_user_id,
                total_sessions=len(sessions),
                weakest_phases=weakest_phases,
                progress_over_time=progress,
            )

        except Exception as e:
            logger.error(f"Failed to generate user summary for mock_user_id {mock_user_id}: {e}")
            raise Exception(f"Failed to generate user summary: {e}")
