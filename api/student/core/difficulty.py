"""The 2-down/1-up difficulty staircase.

Borrowed from psychophysics: it converges around a ~70.7% success rate, close
to the ~85% "optimal learning rate" region Wilson et al. found, and -- unlike
a slower 3-down/1-up rule -- it actually moves within the 5-12 questions one
session provides. See INTERVIEW_ARCHITECTURE.md section 2.
"""

from __future__ import annotations

from dataclasses import dataclass

MIN_TIER = 1
MAX_TIER = 5

# Scores are 0-10. Above HIGH counts as a clean pass for streak purposes;
# at or below LOW is a miss the candidate is struggling with, not just an
# imperfect answer.
HIGH_THRESHOLD = 7
LOW_THRESHOLD = 4

TIER_INFO: dict[int, dict[str, str]] = {
    1: {
        "name": "foundational",
        "anchor": "Expects a correct definition and standard usage. No trade-off "
                  "reasoning required -- naming the right concept and applying it "
                  "in the obvious way is a strong answer.",
    },
    2: {
        "name": "applied",
        "anchor": "Expects the concept applied to a concrete scenario, not just "
                  "defined. A strong answer connects it to something the candidate "
                  "actually built.",
    },
    3: {
        "name": "proficient",
        "anchor": "Expects trade-off reasoning: why this approach over a plausible "
                  "alternative, and where it stops working.",
    },
    4: {
        "name": "advanced",
        "anchor": "Expects the candidate to raise failure modes and trade-offs "
                  "unprompted, without being asked 'what could go wrong'.",
    },
    5: {
        "name": "expert",
        "anchor": "Expects first-principles reasoning about a novel situation, "
                  "including the candidate critiquing their own proposal.",
    },
}


@dataclass(frozen=True)
class DifficultyState:
    tier: int
    # Consecutive HIGH-scoring answers since the last tier change or miss.
    # Needs exactly two in a row to climb -- a single strong answer isn't
    # enough signal on its own.
    streak: int = 0


def initial_state(seniority_signal: str | None) -> DifficultyState:
    """Starting tier. A resume with clear senior signals starts one tier up
    rather than making an obviously senior candidate sit through foundational
    questions before the staircase catches up."""
    return DifficultyState(tier=3 if seniority_signal == "senior" else 2)


def update(state: DifficultyState, score: float | None) -> DifficultyState:
    """Advance the staircase by one answer.

    `score` is None for an answer that couldn't be evaluated (see
    GroqService.evaluate_answer's failure path) -- that must not move
    difficulty in either direction, since there's no signal to act on.
    """
    if score is None:
        return state

    if score <= LOW_THRESHOLD:
        return DifficultyState(tier=max(MIN_TIER, state.tier - 1), streak=0)

    if score >= HIGH_THRESHOLD:
        streak = state.streak + 1
        if streak >= 2:
            return DifficultyState(tier=min(MAX_TIER, state.tier + 1), streak=0)
        return DifficultyState(tier=state.tier, streak=streak)

    # A middling score (between LOW and HIGH) is neither a miss nor a clean
    # pass. It breaks a building streak but doesn't move the tier itself.
    return DifficultyState(tier=state.tier, streak=0)


def tier_prompt_context(tier: int) -> str:
    """Render a tier as prompt text. Never pass the bare integer to an LLM --
    'difficulty: 4' means nothing to a model; a named tier with a written
    behavioural anchor does."""
    info = TIER_INFO.get(tier, TIER_INFO[3])
    return f"{info['name'].capitalize()} (tier {tier}/5): {info['anchor']}"
