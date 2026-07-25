import json
import logging

from groq import Groq

from student.config.settings import settings

logger = logging.getLogger(__name__)

# The interview's shape, as counts per category. Still fixed at nine for now --
# INTERVIEW_ARCHITECTURE.md replaces this with a duration-driven agenda in
# stage 2, at which point questions stop being generated in one batch at all.
QUESTION_PLAN = [
    ("technical", 3, "specific to the role and to skills the resume actually claims"),
    ("hr", 3, "behavioural, probing culture fit and how they work with others"),
    ("situational", 2, "scenario-based, testing judgement under ambiguity"),
    ("surprise", 1, "unexpected but fair, testing adaptability rather than trivia"),
]

TOTAL_QUESTIONS = sum(count for _, count, _ in QUESTION_PLAN)


class GroqService:
    def __init__(self):
        self.client = Groq(api_key=settings.LLM_API_KEY)

    def _chat_json(self, system: str, user: str, max_tokens: int) -> dict:
        """One chat completion constrained to a JSON object, parsed.

        Everything structured goes through here. The previous approach asked
        for markdown and scraped it with regexes, which failed in three
        separate ways -- see the call sites.
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

    def generate_interview_questions(self, resume_text: str) -> list:
        """Generate interview questions grounded in the candidate's resume.

        Previously this asked for markdown headings and numbered lists, then
        parsed them by hand. Three things were wrong with that:

        1. The prompt specified "- **Technical:**" (leading hyphen) while the
           parser matched `line.startswith("**Technical:**")`. A model that
           followed the prompt exactly produced *zero* parsed questions; it
           only ever worked because the model usually dropped the hyphen.
        2. `max_tokens=500` for nine questions plus headings is close enough
           to the limit that a verbose run got truncated mid-list, silently
           yielding a short interview.
        3. The cleanup regex `r"^\\d+\\.\\s*|\\d+\\s"` left its second branch
           unanchored, so it deleted *any* digit followed by whitespace
           anywhere in the text: "5 years of experience" came out as "years
           of experience".

        JSON mode removes all three. Output is validated before it is used.
        """
        spec = "\n".join(
            f'- "{category}": {count} question(s), {guidance}'
            for category, count, guidance in QUESTION_PLAN
        )

        prompt = f"""Generate a mock interview for this candidate, for a Software Engineer role.

Resume:
\"\"\"
{resume_text[:12000]}
\"\"\"

Produce exactly {TOTAL_QUESTIONS} questions:
{spec}

Ground every question in something the resume actually says -- name the
project, employer, or technology you are asking about. Do not ask about
skills the candidate has not claimed.

Respond with JSON of exactly this shape and nothing else:
{{"questions": [{{"text": "...", "category": "technical"}}]}}

`category` must be one of: {", ".join(c for c, _, _ in QUESTION_PLAN)}."""

        try:
            payload = self._chat_json(
                system="You write grounded, resume-specific interview questions. You reply with JSON only.",
                user=prompt,
                # ~9 questions of real substance. The old 500 was a truncation
                # risk; this leaves headroom without being wasteful.
                max_tokens=2000,
            )
        except Exception as e:
            logger.error(f"Question generation failed: {e}")
            raise Exception(f"Error generating interview questions: {e}")

        valid_categories = {c for c, _, _ in QUESTION_PLAN}
        questions = []
        for item in payload.get("questions", []):
            text = (item.get("text") or "").strip()
            category = (item.get("category") or "").strip().lower()
            if not text:
                continue
            if category not in valid_categories:
                category = "technical"
            questions.append({"text": text, "category": category})

        # A session with one or two questions is worse than a clear failure:
        # the candidate finishes in 90 seconds and gets a report built on
        # nothing. Fail here so the caller can surface a real error.
        if len(questions) < TOTAL_QUESTIONS:
            raise Exception(
                f"Model returned {len(questions)} usable questions, expected {TOTAL_QUESTIONS}"
            )

        return questions[:TOTAL_QUESTIONS]

    def evaluate_answer(self, question_text: str, answer_text: str) -> dict:
        """Score one answer and explain the score.

        Was `re.search(r"Score: (\\d+)")` over free prose, which raised
        whenever the model phrased its reply even slightly differently -- and
        that exception propagated as a 500 out of /submit-answer, losing the
        answer entirely rather than degrading.
        """
        answer_text = (answer_text or "").strip()
        if not answer_text:
            return {
                "score": 0,
                "feedback": "No answer was recorded for this question.",
            }

        prompt = f"""Evaluate this interview answer.

Question:
{question_text}

Answer (transcribed from speech, so ignore punctuation and filler):
{answer_text}

Judge relevance to the question, specificity (concrete examples, numbers,
named tools), depth of reasoning, and structure. Reward evidence; penalise
confident vagueness.

Respond with JSON of exactly this shape:
{{"score": 7, "feedback": "two or three sentences, citing what they actually said"}}

`score` is an integer from 0 to 10."""

        try:
            payload = self._chat_json(
                system="You are a fair, specific interview assessor. You reply with JSON only.",
                user=prompt,
                max_tokens=400,
            )
            score = int(payload.get("score", 0))
            feedback = (payload.get("feedback") or "").strip()
        except Exception as e:
            # Degrade instead of 500-ing: the transcript is the valuable part
            # and it is already captured by the caller.
            logger.error(f"Answer evaluation failed: {e}")
            return {
                "score": None,
                "feedback": "This answer could not be scored automatically.",
            }

        score = max(0, min(10, score))
        return {
            "score": score,
            "feedback": feedback or "No feedback was returned for this answer.",
        }
