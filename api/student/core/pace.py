"""Speaking pace, computed from what Whisper already knows.

This is delivery coaching, shown privately to the candidate -- never a score
input, and never framed as "stress" or any other inferred emotional state.
Inferring a candidate's emotional state is prohibited under EU AI Act
Article 5(1)(f) in workplace and educational contexts; wpm deviation from a
comfortable speaking range carries no such claim, so it's the one delivery
signal this product keeps. See INTERVIEW_ARCHITECTURE.md section 8.
"""

from __future__ import annotations

IDEAL_WPM_LOW = 120
IDEAL_WPM_HIGH = 160


def words_per_minute(answer_text: str, duration_seconds: float | None) -> float | None:
    """None when duration isn't known (a Whisper response that didn't carry
    one) rather than computed against a fabricated fallback -- see
    whisper_service.transcribe()."""
    if not duration_seconds or duration_seconds < 2.0:
        return None
    word_count = len(answer_text.split())
    return (word_count / duration_seconds) * 60


def pace_label(wpm: float | None) -> str:
    if wpm is None:
        return "Not available"
    if wpm > IDEAL_WPM_HIGH:
        return "Faster than average"
    if wpm < IDEAL_WPM_LOW:
        return "Slower than average"
    return "Comfortable pace"
