"""Turn resume text into a structured profile, once, and remember it.

Every part of the product that touches a resume used to re-derive its
structure from prose in its own prompt: question generation, the recruiter
ranking, the report. That is three chances to disagree about what the
candidate's job title even is, paid for with a full LLM pass each time, on
text the recruiter path additionally truncated to 2000 characters.

Parsing once into a typed shape fixes all of that, and gives the interview
something concrete to cite -- "you shipped X at Y" rather than "your resume
mentions Python".
"""

from __future__ import annotations

import json
import logging

from student.config.settings import settings

logger = logging.getLogger(__name__)

# Empty shape returned when parsing fails. Callers can still run a
# resume-text-only interview off the back of this; they just lose the
# grounding that structure buys.
EMPTY_PROFILE: dict = {
    "contact": {},
    "education": [],
    "experience": [],
    "projects": [],
    "skills": {"languages": [], "frameworks": [], "tools": [], "domains": []},
    "certifications": [],
    "seniority_signal": "unknown",
    "parse_warnings": ["Resume could not be parsed into a structured profile."],
}

_SCHEMA_HINT = """{
  "contact": {"name": "", "email": "", "location": "", "links": []},
  "education": [{"institution": "", "degree": "", "field": "", "start": "", "end": "", "gpa": ""}],
  "experience": [{"company": "", "title": "", "start": "", "end": "", "bullets": []}],
  "projects": [{"name": "", "description": "", "tech": [], "bullets": []}],
  "skills": {"languages": [], "frameworks": [], "tools": [], "domains": []},
  "certifications": [],
  "seniority_signal": "junior|mid|senior",
  "parse_warnings": []
}"""


class ResumeParser:
    def __init__(self, supabase, groq_service):
        self.supabase = supabase
        self.groq_service = groq_service

    # ------------------------------------------------------------------ #

    def get_profile(self, resume_id: str, resume_text: str) -> dict:
        """Return the structured profile for a resume, parsing it if needed."""
        cached = self._read_cache(resume_id)
        if cached is not None:
            logger.info(f"Resume profile cache hit for {resume_id}")
            return cached

        profile = self.parse(resume_text)
        self._write_cache(resume_id, profile)
        return profile

    def parse(self, resume_text: str) -> dict:
        """Extract a structured profile from resume text."""
        prompt = f"""Extract this resume into structured data.

Resume:
\"\"\"
{resume_text[:20000]}
\"\"\"

Rules:
- Copy what the resume says. Do not infer, embellish, or fill gaps.
- Leave a field as "" or [] when the resume does not state it.
- `bullets` are the candidate's own achievement lines, lightly cleaned up.
- `seniority_signal` is your read of their level from years of experience and
  scope of ownership -- "junior", "mid", or "senior".
- Put anything that looked garbled or unreadable into `parse_warnings`.

Respond with JSON of exactly this shape:
{_SCHEMA_HINT}"""

        try:
            payload = self.groq_service._chat_json(
                system="You extract structured data from resumes. You reply with JSON only.",
                user=prompt,
                max_tokens=4000,
            )
        except Exception as e:
            logger.error(f"Resume parsing failed: {e}")
            return dict(EMPTY_PROFILE)

        return self._normalise(payload)

    # ------------------------------------------------------------------ #

    @staticmethod
    def _normalise(payload: dict) -> dict:
        """Coerce the model's output into the shape callers expect.

        Downstream code indexes into this without checking; a model that
        returns `skills` as a flat list instead of an object should not
        become a TypeError three call frames away.
        """
        def as_list(value):
            if isinstance(value, list):
                return value
            if value in (None, "", {}):
                return []
            return [value]

        skills = payload.get("skills")
        if not isinstance(skills, dict):
            # Flat list of skills is a common shape for a model to fall into.
            skills = {"languages": as_list(skills), "frameworks": [], "tools": [], "domains": []}

        seniority = str(payload.get("seniority_signal") or "unknown").lower().strip()
        if seniority not in {"junior", "mid", "senior"}:
            seniority = "unknown"

        return {
            "contact": payload.get("contact") if isinstance(payload.get("contact"), dict) else {},
            "education": as_list(payload.get("education")),
            "experience": as_list(payload.get("experience")),
            "projects": as_list(payload.get("projects")),
            "skills": {
                "languages": as_list(skills.get("languages")),
                "frameworks": as_list(skills.get("frameworks")),
                "tools": as_list(skills.get("tools")),
                "domains": as_list(skills.get("domains")),
            },
            "certifications": as_list(payload.get("certifications")),
            "seniority_signal": seniority,
            "parse_warnings": as_list(payload.get("parse_warnings")),
        }

    def _read_cache(self, resume_id: str) -> dict | None:
        try:
            row = (
                self.supabase.table("mock_interview_resume_profiles")
                .select("profile")
                .eq("resume_id", resume_id)
                .limit(1)
                .execute()
            )
            if row.data:
                return row.data[0]["profile"]
        except Exception as e:
            # A cache miss must never take the interview down with it.
            logger.warning(f"Resume profile cache read failed for {resume_id}: {e}")
        return None

    def _write_cache(self, resume_id: str, profile: dict) -> None:
        try:
            self.supabase.table("mock_interview_resume_profiles").upsert(
                {"resume_id": resume_id, "profile": profile},
                on_conflict="resume_id",
            ).execute()
        except Exception as e:
            logger.warning(f"Resume profile cache write failed for {resume_id}: {e}")


def profile_to_prompt_context(profile: dict) -> str:
    """Render a profile as compact text for a prompt.

    Passing raw JSON to a small model wastes tokens on punctuation and invites
    it to echo the schema back. This is the same information as prose.
    """
    lines: list[str] = []

    experience = profile.get("experience") or []
    if experience:
        lines.append("Experience:")
        for job in experience[:6]:
            header = " ".join(
                p for p in [job.get("title"), "at", job.get("company")] if p
            ).strip()
            span = " - ".join(p for p in [job.get("start"), job.get("end")] if p)
            lines.append(f"- {header}{f' ({span})' if span else ''}")
            for bullet in (job.get("bullets") or [])[:4]:
                lines.append(f"    * {bullet}")

    projects = profile.get("projects") or []
    if projects:
        lines.append("Projects:")
        for proj in projects[:5]:
            tech = ", ".join(proj.get("tech") or [])
            lines.append(
                f"- {proj.get('name', 'Untitled')}"
                f"{f' [{tech}]' if tech else ''}: {proj.get('description', '')}"
            )

    skills = profile.get("skills") or {}
    flat_skills = [
        s
        for group in ("languages", "frameworks", "tools", "domains")
        for s in (skills.get(group) or [])
    ]
    if flat_skills:
        lines.append("Claimed skills: " + ", ".join(flat_skills[:40]))

    education = profile.get("education") or []
    if education:
        lines.append("Education:")
        for ed in education[:3]:
            lines.append(
                f"- {ed.get('degree', '')} {ed.get('field', '')} "
                f"at {ed.get('institution', '')}".strip()
            )

    certs = profile.get("certifications") or []
    if certs:
        lines.append("Certifications: " + ", ".join(str(c) for c in certs[:10]))

    return "\n".join(lines).strip()
