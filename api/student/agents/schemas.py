"""The prep agent's output contract.

Passed as `response_format` to `create_deep_agent`, so the agent's final
answer is captured as this type in `result["structured_response"]` instead of
free-form prose that the caller would have to re-parse.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

DifficultyHint = Literal["foundational", "applied", "proficient", "advanced", "expert"]


class QuestionSeed(BaseModel):
    """One candidate question for the live interview to draw on.

    `source_count == 0` means resume-derived only -- no external grounding
    was found or attempted for it. That distinction is shown to the
    candidate (see INTERVIEW_ARCHITECTURE.md section 4); it must never be
    fabricated to look more grounded than it is.
    """

    text: str = Field(description="The question itself.")
    theme: str = Field(description="Short label for what this question probes, e.g. 'distributed systems failure modes'.")
    difficulty_hint: DifficultyHint = Field(
        description="Rough difficulty this question fits, using the same tier names as the live interview's staircase."
    )
    source_count: int = Field(
        default=0,
        description="How many distinct real sources support this question. 0 if resume-derived only.",
    )
    source_urls: list[str] = Field(default_factory=list)
    date_range: list[str] = Field(
        default_factory=list,
        description="[earliest, latest] ISO dates of the sources, if any.",
    )


class InterviewBrief(BaseModel):
    grounded: bool = Field(
        description="True only if at least one QuestionSeed has source_count > 0. "
        "False for a resume-only brief -- do not set this True to look more thorough."
    )
    company_summary: str = Field(
        default="", description="What you found about the company relevant to this role. Empty if no company was named."
    )
    role_focus: list[str] = Field(
        default_factory=list,
        description="The competencies this role/company actually seems to test for, based on your research.",
    )
    questions: list[QuestionSeed] = Field(default_factory=list)
