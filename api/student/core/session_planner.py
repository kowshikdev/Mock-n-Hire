"""Turn a duration into a phase plan, and decide what phase/budget the next
question in a session should draw from.

Pure functions, no I/O, so the staircase-of-edge-cases here (grace period,
phase rollover, follow-ups spending the parent's budget) can be unit tested
without a database or an LLM. The route layer (Stage 4) is the only caller.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# (phase, share of total duration, seconds budgeted per question in that phase)
PHASE_SPEC: list[tuple[str, float, int]] = [
    ("warmup", 0.12, 120),
    ("technical", 0.40, 180),
    ("behavioral", 0.28, 150),
    ("situational", 0.15, 150),
    ("closing", 0.05, 90),
]

# Every interview opens with this, verbatim.
#
# It used to be generated from the resume, which was wrong three ways. Real
# interviews open with a self-introduction, so a resume-specific opener broke
# the one convention every candidate has actually rehearsed. It put a Groq
# call on the critical path of session creation, so the candidate waited on a
# spinner for a question that needed no thought to produce. And it wasted the
# most useful signal in the session: what a candidate *chooses* to lead with,
# unprompted, grounds every question that follows better than anything a model
# could infer from the resume alone.
#
# Being a constant is the point -- it is served without an LLM call, so the
# interview starts the instant the session row is written.
OPENING_QUESTION = "To start, tell me a bit about yourself and what brings you to this role."

# A session hard-stops here even mid-phase. Long enough that one slow answer
# near the end doesn't cut the candidate off mid-sentence; short enough that
# a stalled session doesn't run forever.
GRACE_FACTOR = 1.10

# A phase advances once its remaining time can't comfortably fit another
# question. Below half a question's budget, starting one just to cut it short
# is worse than moving to the next phase early.
PHASE_ADVANCE_THRESHOLD = 0.5


def build_plan(duration_seconds: int) -> list[dict]:
    """Split a session's duration into phase budgets.

    Rounding is intentionally not reconciled to sum exactly to
    duration_seconds -- a few seconds of drift across five phases is
    immaterial next to the grace period, and forcing an exact sum would make
    one phase's budget depend on rounding error in the other four.
    """
    return [
        {
            "phase": phase,
            "budget_seconds": round(duration_seconds * share),
            "question_time_budget": qtime,
        }
        for phase, share, qtime in PHASE_SPEC
    ]


def expected_question_counts(plan: list[dict]) -> dict[str, int]:
    """Roughly how many questions each phase has room for.

    The live loop never uses this -- it decides phase by phase from real
    elapsed time, because a candidate who answers fast earns extra questions
    and one who rambles gets fewer. This is for the *prep* agent, which has
    to decide how much material to research before any of that is known. A
    15-minute session wants about seven questions and a 45-minute one about
    twenty, and researching a flat "6-10" for both left the long session
    running out of prepared material halfway through.

    Deliberately a floor of one: a phase with room for half a question still
    gets asked one, so it still needs something prepared.
    """
    return {
        p["phase"]: max(1, round(p["budget_seconds"] / p["question_time_budget"]))
        for p in plan
    }


@dataclass(frozen=True)
class AskedQuestion:
    phase: str
    time_budget_seconds: int
    asked_at: datetime
    answered_at: datetime | None = None
    is_followup: bool = False

    def spent_seconds(self) -> float:
        """How much of the phase budget this question actually used.

        An answered question spends the wall-clock time between being asked
        and answered -- a candidate who wraps up early gets that time back
        for later questions, per the architecture's elapsed-time invariant.
        A question with no answer yet (the one in flight) is charged its full
        budget, since that time is committed until it resolves.
        """
        if self.answered_at is None:
            return float(self.time_budget_seconds)
        return max(0.0, (self.answered_at - self.asked_at).total_seconds())


@dataclass(frozen=True)
class NextSlot:
    phase: str
    time_budget_seconds: int


def next_slot(
    plan: list[dict],
    asked: list[AskedQuestion],
    session_start: datetime,
    now: datetime,
    duration_seconds: int,
) -> NextSlot | None:
    """Decide which phase (and time budget) the next question should draw
    from, or None if the session is over.

    Follow-ups spend their *parent* phase's budget -- they are passed in
    `asked` tagged with that phase like any other question, so depth already
    costs breadth without this function needing to know about parent/child at
    all.
    """
    if (now - session_start).total_seconds() >= duration_seconds * GRACE_FACTOR:
        return None

    spent_by_phase: dict[str, float] = {}
    for q in asked:
        spent_by_phase[q.phase] = spent_by_phase.get(q.phase, 0.0) + q.spent_seconds()

    for phase in plan:
        name = phase["phase"]
        remaining = phase["budget_seconds"] - spent_by_phase.get(name, 0.0)
        if remaining >= phase["question_time_budget"] * PHASE_ADVANCE_THRESHOLD:
            return NextSlot(phase=name, time_budget_seconds=phase["question_time_budget"])

    return None


def phase_remaining_seconds(plan: list[dict], asked: list[AskedQuestion], phase_name: str) -> float:
    """Budget left in a specific phase -- used to decide whether a follow-up
    can be afforded before it is generated, separately from next_slot()'s
    walk across all phases in order."""
    spent = sum(q.spent_seconds() for q in asked if q.phase == phase_name)
    budget = next((p["budget_seconds"] for p in plan if p["phase"] == phase_name), 0.0)
    return budget - spent


def progress_fraction(
    plan: list[dict], asked: list[AskedQuestion], session_start: datetime, now: datetime, duration_seconds: int
) -> float:
    """0..1, for a progress bar. Time-based, since question count is no
    longer known in advance."""
    elapsed = (now - session_start).total_seconds()
    return min(1.0, max(0.0, elapsed / duration_seconds))
