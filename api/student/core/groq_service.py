import json
import logging

from groq import Groq

from student.config.settings import settings
from student.core.difficulty import tier_prompt_context

logger = logging.getLogger(__name__)

# Follow-up cap per root question -- see INTERVIEW_ARCHITECTURE.md section 2.
# Technical gets a second follow-up because a design question's depth is
# often only visible two probes in; every other phase gets one.
FOLLOWUP_LIMIT_BY_PHASE = {"technical": 2}
DEFAULT_FOLLOWUP_LIMIT = 1


class GroqService:
    def __init__(self):
        self.client = Groq(api_key=settings.LLM_API_KEY)

    def _chat_json(self, system: str, user: str, max_tokens: int) -> dict:
        """One chat completion constrained to a JSON object, parsed.

        Everything structured goes through here rather than through markdown
        scraped with regexes -- see git history for how that failed.
        """
        completion = self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            model=settings.LLM_MODEL,
            max_tokens=max_tokens,
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        return json.loads(completion.choices[0].message.content)

    # ------------------------------------------------------------------ #
    # Question generation -- one at a time, just in time. There is no
    # longer a single call that produces a whole interview: the session is
    # duration-driven, so the number of questions isn't known until the
    # session ends. See INTERVIEW_ARCHITECTURE.md sections 1-2.
    # ------------------------------------------------------------------ #

    def generate_first_question(self, candidate_context: str, target_role: str) -> str:
        """The warm-up question. Resume-derived only, deliberately -- this
        has to be answerable the instant a session is created, before the
        prep agent (which can take minutes) has had a chance to run."""
        prompt = f"""Write ONE warm-up interview question for a {target_role} candidate.

Candidate:
\"\"\"
{candidate_context or "(no resume details available)"}
\"\"\"

It should invite them to walk through their background, but anchored to
something specific on their resume -- a notable project, role, or
transition -- not a generic "tell me about yourself".

Respond with JSON of exactly this shape: {{"text": "..."}}"""

        payload = self._chat_json(
            system="You write warm, specific interview openers. You reply with JSON only.",
            user=prompt,
            max_tokens=300,
        )
        text = (payload.get("text") or "").strip()
        if not text:
            raise Exception("Model returned an empty warm-up question")
        return text

    def analyse_fit(
        self,
        candidate_context: str,
        target_role: str,
        job_description: str | None,
    ) -> dict:
        """What this candidate should expect to be probed on, and why.

        This is the thing a job description actually buys. A role title only
        implies a stack; a JD names it, along with the seniority and the
        responsibilities -- so "the posting asks for Kafka and your resume
        shows RabbitMQ" is a question worth asking, and one no amount of
        role-title guessing would produce.

        Runs with or without a JD: without one it reduces to "what does this
        resume leave open for this role", which is still better than nothing
        and keeps the caller free of a second code path.
        """
        jd_block = (
            f"Job description:\n\"\"\"\n{job_description.strip()[:6000]}\n\"\"\""
            if (job_description or "").strip()
            else "No job description was provided -- work from the role title alone."
        )

        prompt = f"""Compare this candidate against what the role demands.

Target role: {target_role}

{jd_block}

Candidate:
\"\"\"
{candidate_context or "(no resume details available)"}
\"\"\"

Identify 3-6 areas an interviewer would genuinely want to probe. For each:
- topic: the specific competency or technology, not a vague category
- status: "gap" if the role needs it and the resume shows no evidence,
  "partial" if there's adjacent-but-not-matching evidence, "strength" if
  the resume evidences it well and it's worth testing depth on
- why: one sentence citing what the role asks for and what the resume shows

Only claim something is in the job description if it actually appears there.
Prefer gaps and partials over strengths -- those are where an interview is
most informative.

Respond with JSON of exactly this shape:
{{"role_summary": "one sentence on what this role really tests for",
  "focus_areas": [{{"topic": "...", "status": "gap", "why": "..."}}]}}"""

        payload = self._chat_json(
            system="You analyse the fit between a resume and a role, concretely and without flattery. You reply with JSON only.",
            user=prompt,
            max_tokens=900,
        )
        return _normalise_fit(payload)

    def generate_next_question(
        self,
        candidate_context: str,
        target_role: str,
        phase: str,
        difficulty_tier: int,
        asked_texts: list[str],
        seed: dict | None = None,
        focus_area: dict | None = None,
    ) -> dict:
        """One phase-appropriate question.

        If `seed` is given -- a QuestionSeed from the prep agent's brief --
        it is served directly rather than re-generated. It is already an
        original question the prep agent wrote to match a real pattern it
        found (see student/agents/schemas.py); running it through another
        LLM pass would only risk drifting it away from what it was grounded
        in for no benefit.
        """
        if seed:
            return {
                "text": seed["text"],
                "provenance": {
                    "source_count": seed.get("source_count", 0),
                    "source_urls": seed.get("source_urls", []),
                    "date_range": seed.get("date_range", []),
                    "theme": seed.get("theme", ""),
                },
            }

        avoid = "\n".join(f"- {t}" for t in asked_texts[-10:]) or "(none yet)"
        focus_block = ""
        if focus_area:
            focus_block = (
                f"\nProbe this specifically: {focus_area['topic']} "
                f"({focus_area['status']} -- {focus_area['why']})\n"
            )

        prompt = f"""Write ONE {phase} interview question for a {target_role} candidate.

Difficulty: {tier_prompt_context(difficulty_tier)}

Candidate:
\"\"\"
{candidate_context or "(no resume details available)"}
\"\"\"
{focus_block}
Already asked this session -- do not repeat or closely resemble any of these:
{avoid}

Ground the question in the candidate's actual background where the phase
allows it (technical/behavioral); situational and closing questions may be
role-general. Respond with JSON of exactly this shape: {{"text": "..."}}"""

        payload = self._chat_json(
            system=f"You write {phase} interview questions calibrated to a specific difficulty level. You reply with JSON only.",
            user=prompt,
            max_tokens=3500,
        )
        text = (payload.get("text") or "").strip()
        if not text:
            raise Exception(f"Model returned an empty {phase} question")
        provenance = (
            {"source_count": 0, "source_urls": [], "date_range": [], "theme": focus_area["topic"],
             "origin": "jd_gap" if focus_area["status"] in ("gap", "partial") else "resume"}
            if focus_area
            else None
        )
        return {"text": text, "provenance": provenance}

    # ------------------------------------------------------------------ #
    # Evaluation, split across the latency boundary.
    #
    # `assess_turn` is what the candidate waits on: a score, the claims they
    # made, and a follow-up if one is warranted. Small and fast, because
    # every token here is silence between them finishing an answer and
    # hearing the next question.
    #
    # `evaluate_answer` is the long-form rubric -- evidence quotes, gaps,
    # written feedback. Nobody is waiting on it: the interviewer does not
    # need a rubric to know what to ask next, and the candidate does not see
    # any of it until the report. So it runs after the response has already
    # gone out, and its extra second costs nothing.
    # ------------------------------------------------------------------ #

    def assess_turn(
        self,
        question_text: str,
        answer_text: str,
        phase: str,
        followups_used: int,
        is_followup: bool,
    ) -> dict:
        """Score the answer and decide the follow-up, on the critical path.

        The follow-up targets a *claim* rather than the answer in general.
        Asking the model to first name what the candidate concretely
        asserted, then probe the least-supported of those, is what produces
        "you mentioned you led the Kafka migration -- what broke?" instead of
        "can you elaborate?". The old version judged the transcript as a
        whole and had no notion of what had actually been claimed.
        """
        answer_text = (answer_text or "").strip()
        if not answer_text:
            return {"score": None, "claims": [], "followup_question": None}

        limit = FOLLOWUP_LIMIT_BY_PHASE.get(phase, DEFAULT_FOLLOWUP_LIMIT)
        can_followup = (not is_followup) and followups_used < limit

        followup_instruction = (
            "Then decide on a follow-up. Ask one ONLY if a specific claim was "
            "load-bearing but unsupported -- they asserted something concrete "
            "and gave no evidence for it. Quote the claim in your question so "
            "it is obvious what you are probing. If every claim was either "
            "well-evidenced or unimportant, return null: a strong, specific "
            "answer does not earn a follow-up."
            if can_followup
            else "Return null for followup_question -- the follow-up budget for "
                 "this question is already spent."
        )

        prompt = f"""Assess this interview answer.

Question:
{question_text}

Candidate's answer (transcribed from speech -- ignore punctuation and filler):
{answer_text}

First list the concrete, checkable claims they made -- specific technologies,
actions they personally took, numbers, outcomes. Not vague statements.

Then score the answer 0-10 overall.

{followup_instruction}

Respond with JSON of exactly this shape:
{{"claims": ["..."], "score": 0, "followup_question": null}}"""

        try:
            payload = self._chat_json(
                system="You are a fair, specific interview assessor. You reply with JSON only.",
                user=prompt,
                max_tokens=300,
            )
        except Exception as e:
            logger.error(f"Turn assessment failed: {e}")
            return {"score": None, "claims": [], "followup_question": None}

        followup = (payload.get("followup_question") or "").strip() or None
        return {
            "score": _clamp10(payload.get("score")),
            "claims": [c for c in (payload.get("claims") or []) if isinstance(c, str)][:5],
            # Enforced here rather than trusted: the chain stays one level
            # deep and within budget regardless of what the model returns.
            "followup_question": followup if can_followup else None,
        }

    def evaluate_answer(self, question_text: str, answer_text: str) -> dict:
        """The long-form rubric, off the critical path.

        Scoring lives in `assess_turn`, not here: the score has to exist
        synchronously because the difficulty staircase reads it before
        choosing the next question, whereas none of the detail below is seen
        until the report. This call therefore produces explanation, not
        judgement, and deliberately does not return a score to disagree with
        the one already recorded.
        """
        answer_text = (answer_text or "").strip()
        if not answer_text:
            return _empty_answer_rubric()

        prompt = f"""Evaluate this interview answer.

Question:
{question_text}

Candidate's answer (transcribed from speech -- ignore punctuation and filler):
{answer_text}

Score 0-10 on each of:
- relevance: does it actually address the question
- specificity: concrete examples, numbers, named tools/technologies
- depth: real reasoning, not just facts recited
- structure: clarity and organization

Quote up to 3 short phrases from their actual answer that support your
judgement (evidence_quotes). List real gaps, if any (gaps) -- claims made
without support, or parts of the question left unaddressed.

Respond with JSON of exactly this shape:
{{"relevance": 0, "specificity": 0, "depth": 0, "structure": 0,
  "evidence_quotes": ["..."], "gaps": ["..."],
  "feedback": "two or three sentences, citing what they actually said"}}"""

        try:
            payload = self._chat_json(
                system="You are a fair, specific interview assessor. You reply with JSON only.",
                user=prompt,
                max_tokens=600,
            )
            return _normalise_rubric(payload)
        except Exception as e:
            logger.error(f"Answer evaluation failed: {e}")
            return {
                **_empty_answer_rubric(),
                "feedback": "This answer could not be evaluated in detail.",
            }


FIT_STATUSES = ("gap", "partial", "strength")


def _normalise_fit(payload: dict) -> dict:
    areas = []
    for raw in (payload.get("focus_areas") or [])[:6]:
        if not isinstance(raw, dict):
            continue
        topic = (raw.get("topic") or "").strip()
        if not topic:
            continue
        status = (raw.get("status") or "").strip().lower()
        areas.append({
            "topic": topic,
            # An unrecognised status becomes "partial" rather than being
            # dropped: the topic is still worth probing, and "partial" is the
            # claim that asserts least about the candidate.
            "status": status if status in FIT_STATUSES else "partial",
            "why": (raw.get("why") or "").strip(),
        })
    return {
        "role_summary": (payload.get("role_summary") or "").strip(),
        "focus_areas": areas,
    }


def _clamp10(value) -> int:
    try:
        return max(0, min(10, int(value)))
    except (TypeError, ValueError):
        return 0


def _normalise_rubric(payload: dict) -> dict:
    return {
        "relevance": _clamp10(payload.get("relevance")),
        "specificity": _clamp10(payload.get("specificity")),
        "depth": _clamp10(payload.get("depth")),
        "structure": _clamp10(payload.get("structure")),
        "evidence_quotes": [q for q in (payload.get("evidence_quotes") or []) if isinstance(q, str)][:3],
        "gaps": [g for g in (payload.get("gaps") or []) if isinstance(g, str)][:5],
        "feedback": (payload.get("feedback") or "").strip() or "No feedback was returned for this answer.",
    }


def _empty_answer_rubric() -> dict:
    return {
        "relevance": 0,
        "specificity": 0,
        "depth": 0,
        "structure": 0,
        "evidence_quotes": [],
        "gaps": ["No answer was given."],
        "feedback": "No answer was recorded for this question.",
    }
