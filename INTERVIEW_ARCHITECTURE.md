# Interview architecture

How a Mock'n-Hire practice interview is planned, conducted, and scored — and
why it is built this way. This is the design of record for issues #9–#12.

---

## 1. What is wrong with the current design

The interview that exists today is not an interview. It is a quiz with a
recorder attached.

`generate_questions` makes **one** LLM call at session start, asks for nine
questions in a fixed 3/3/2/1 split, regex-parses them out of markdown, writes
all nine rows to `mock_interview_questions`, and then plays them back in order.
Nothing that happens during the session changes anything that comes after it.

Concretely, the following are all true of the current code:

- **The question count is arbitrary.** Nine, always, regardless of whether the
  candidate has 15 minutes or an hour. Real interviews are time-boxed, not
  question-boxed.
- **Every question gets 120 seconds.** A "tell me about yourself" and a
  distributed-systems design question get identical budgets.
- **There are no follow-ups.** The single most-cited difference between a real
  interview and a practice tool is that a real interviewer says *"you mentioned
  Kubernetes — walk me through a deployment that went wrong."* Nothing in the
  current pipeline can do that, because all nine questions were written before
  the candidate said a word.
- **Difficulty never moves.** A candidate who nails Q1 gets the same Q2 as one
  who freezes.
- **The role is hardcoded.** `groq_service.py` literally says
  `Job Role: Software Engineer`, `Company: Mock Interview Inc.` for everyone.
- **The resume is a raw text blob.** `fitz` text-dump straight into a prompt,
  no structure, no validation, truncated to 2000 chars on the recruiter side.
- **The parser is fragile.** The prompt asks for `- **Technical:**` (leading
  hyphen); the parser matches `line.startswith("**Technical:**")`. It works
  today by luck. `max_tokens=500` for nine questions plus headers risks
  truncation, and the cleanup regex `r"^\d+\.\s*|\d+\s"` is unanchored on its
  second branch, so it deletes any digit-space pair anywhere in the string —
  "5 years of experience" becomes "years of experience".

Everything below replaces that.

---

## 2. The session model: time, not question count

**A session is a duration, an agenda, and a running clock.** The number of
questions is an *output* of the interview, not an input to it.

The candidate chooses a duration when starting a session. Each duration is
divided into phases, mirroring how a real screen is structured:

| Phase        | Share | What it is                                          | Scored |
| ------------ | ----- | --------------------------------------------------- | ------ |
| `warmup`     | 12%   | "Walk me through your background." Resume-anchored.  | Yes    |
| `technical`  | 40%   | Role competencies, adaptive difficulty.              | Yes    |
| `behavioral` | 28%   | STAR-shaped, probes claims made on the resume.       | Yes    |
| `situational`| 15%   | Judgment under ambiguity.                            | Yes    |
| `closing`    | 5%    | "What would you like to ask?" Delivery only.         | No     |

For a 30-minute session that is 216 / 720 / 504 / 270 / 90 seconds.

Per-question time budgets vary by phase — 120s warmup, 180s technical, 150s
behavioral and situational, 90s closing — so a 30-minute interview lands
around 11 questions, and a 15-minute one around 5. But those are consequences,
never targets.

**Loop invariants:**

- Elapsed time is recomputed from wall-clock timestamps after every answer, not
  accumulated from budgets. A candidate who takes 40s on a 180s question gets
  that time back for later questions.
- A phase advances when its remaining budget drops below half of one question's
  budget. Starting a 3-minute system-design question with 80 seconds left is
  worse than moving on.
- The session hard-stops at `duration + 10%` grace, whatever phase it is in.
- A follow-up spends the *parent phase's* budget. Depth costs breadth, which is
  exactly the trade a real interviewer makes.

### Adaptive difficulty

Five tiers — foundational, applied, proficient, advanced, expert — driven by a
**2-down/1-up transformed staircase** borrowed from psychophysics:

- Two consecutive answers scoring ≥7/10 → move up one tier.
- One answer scoring ≤4/10 → move down one tier immediately.
- Clamped to [1, 5]. Starts at tier 2, or tier 3 if the resume profile shows
  senior signals.

This converges on roughly a 70% success rate, which is close to the ~85%
optimum from Wilson et al.'s work on learning rate, and — critically — it
actually *moves* within the 5–12 questions a session has. A 1-up/1-down rule
sits at 50% (demoralising); 3-down/1-up targets 79% but needs far more items
than one session provides before it shifts at all.

Difficulty is passed to the LLM as a **tier name plus a written behavioural
anchor plus two exemplar questions** — never as a bare number. "Difficulty: 4"
means nothing to a model; "Advanced: expects the candidate to reason about
failure modes and trade-offs unprompted" does.

### Follow-ups are a separate axis

A follow-up is *not* "a harder question." It is triggered when the evaluator
returns **high relevance but low specificity or evidence** — the candidate is
on-topic but vague. Cap: one follow-up per question (two in `technical`), and
only when the phase has budget.

---

## 3. Two agents, deliberately different

The single most important architectural decision here: **the prep agent and the
interviewer are not the same thing and must not share an implementation.**

|                        | Prep agent                                     | Interviewer                                |
| ---------------------- | ---------------------------------------------- | ------------------------------------------ |
| When                   | Once, at session creation, in the background   | Every turn, candidate waiting               |
| Steps                  | Unknown — depends what sources exist           | Fixed: transcribe → evaluate → decide → serve |
| Latency budget         | Minutes                                        | Seconds                                     |
| Judgment required      | "Have I researched enough? Is this source stale?" | Score against a rubric                   |
| Built with             | **deepagents**                                 | **Plain Groq calls behind REST**            |

### Why deepagents belongs in prep

The prep agent's job is genuinely open-ended: given a resume, a role, and
optionally a company, go find out what interviewing for that job is actually
like, and come back with an agenda. It does not know in advance how many
searches that takes, which sources will exist, or whether what it finds is
recent enough to trust. It benefits from all three things deepagents provides —
`write_todos` planning, sub-agents with isolated context (a messy 15-source dive
on "Google SRE" must not pollute the résumé analysis), and a virtual filesystem
to accumulate the brief across steps.

This is the same shape as LangChain's own reference deep-research agent, which
is the pattern the docs demonstrate.

### Why deepagents does *not* belong in the live loop

The live loop has a fixed control flow and a human waiting on it. There is no
plan to make and nothing to delegate — an agent framework there buys latency and
failure modes in exchange for flexibility the loop cannot use. The interviewer
is three sequential LLM calls behind a normal endpoint.

### Transport

**Discrete REST, one round-trip per turn.** `POST .../answer` returns the next
question in the same response.

Not SSE: Railway closes SSE connections after 5 minutes idle and caps them at 15
even with heartbeats. A 45-minute interview cannot live on one stream. Not
WebSockets either — they would survive the timeout, but there is nothing to push;
the candidate is speaking for minutes at a time and every state change is
request-driven. Polling would be pure waste.

### Model split

deepagents needs a model that is genuinely good at multi-step tool calling.
LangChain's own eval suite shows this is not a given — several frontier models
score under 30% overall on it. `llama-3.1-8b-instant`, which is fine for scoring
a single answer, will not drive a planning agent.

So there are two model env vars:

- `LLM_MODEL` — fast per-turn work (evaluation, question phrasing). Default
  `llama-3.1-8b-instant`.
- `AGENT_MODEL` — the prep agent only. Needs strong tool calling. Default
  `openai/gpt-oss-120b`.

**Decision: stay on Groq, accept the risk.** No Groq model appears on
LangChain's deepagents eval table, so the prep agent's planning quality is
genuinely unverified — `gemini-3.5-flash` sits at 82% overall / 90% tool use
there and would be the safer pick. Staying single-provider was chosen anyway
to keep one key and one billing surface. `openai/gpt-oss-120b` is the
strongest tool-caller Groq currently serves (Kimi K2 is *not* in their
catalog, despite being the open-weight family LangChain recommends).

This is exactly why prep failure has to be survivable. If the agent turns out
to plan badly on this model, the visible effect is more sessions falling back
to resume-only grounding — not broken interviews. If that rate is high,
switching `AGENT_MODEL` to a Gemini or Anthropic string is a one-line change,
since both integrations are already hard dependencies of deepagents.

Both are env vars for the same reason `LLM_MODEL` already is: Groq
decommissioned `llama3-8b-8192` out from under this codebase once already.

### Failure is not allowed to block the interview

Prep runs as a FastAPI background task. The session starts **immediately** with
the warm-up question, which needs no research at all — it comes from the resume.
By the time the candidate finishes answering it (~2 minutes) the brief is
normally ready. If prep fails, times out, or Tavily is down, the session falls
back to resume-only question generation and the candidate never sees an error.

---

## 4. Tavily: four distinct jobs

Grounding is **cluster-then-generate, never scrape-and-serve**. Reposting
scraped interview questions verbatim is both a terms-of-service problem and a
staleness problem — the questions that leak publicly are the ones companies have
already rotated out.

| Job                       | Endpoint  | Key parameters                                                                                                                     |
| ------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Find reported experiences | `search`  | `search_depth="advanced"`, `topic="general"`, `max_results=10`, `time_range="year"`, `include_domains=[glassdoor, leetcode, reddit, teamblind, interviewquery]`, `include_raw_content="markdown"` |
| Read them properly        | `extract` | Top 5 URLs. Search snippets are too thin to cluster on.                                                                             |
| Company's own ground truth| `map` → `extract` | The engineering blog / careers domain, for the real tech stack rather than a forum's guess.                                  |
| Current market context    | `search`  | `topic="news"`, `time_range="month"` — what this role actually demands *now*, not at the model's training cutoff.                    |

Every generated question stores its provenance:

```json
{
  "source_count": 7,
  "date_range": ["2025-09-02", "2026-06-14"],
  "urls": ["..."],
  "theme": "distributed systems failure modes"
}
```

Shown to the candidate as *"derived from 7 reports, Sep 2025 – Jun 2026."* A
question with no provenance is labelled resume-derived. There is no third
category, and no fabricated confidence percentage.

`TAVILY_API_KEY` is required for company-style mode only; generic mode works
without it.

---

## 5. Resume parsing

Current: `fitz` → `page.get_text("text")` → string → prompt. Six real problems,
each with a fix.

| Problem                                                                                  | Fix                                                                          |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Two-column resumes interleave into nonsense, because `"text"` mode reads in raw stream order | Gutter detection over **line** bboxes (see below)                        |
| Scanned/image PDFs silently extract to `""` and the candidate gets an interview about nothing | Detect near-empty extraction, fail loudly with a real message            |
| No structure — every downstream call re-derives sections from prose                       | One structured-extraction pass into a typed `ResumeProfile`                 |
| Re-parsed on every single call                                                            | Persist to `mock_interview_resume_profiles`, parse once per resume           |
| Recruiter side truncates to `resume_text[:2000]`, cutting most resumes in half             | Feed the structured profile instead; no truncation needed                    |
| Student side is PDF-only while the recruiter side already handles DOCX                    | Share one parser across both                                                 |

### Recovering reading order

Worth recording, because the obvious fix does not work: sorting `get_text("blocks")`
by column is **not** enough. PyMuPDF merges text sharing a baseline into one
block, so on a two-column resume a single block comes back holding *both*
columns for that row — `'SKILLS\nEXPERIENCE'`. The interleaving is inside the
block, and no amount of block-level sorting separates it again.

The bboxes that distinguish the columns only exist one level down, on lines.
So extraction works on lines, and:

1. Scans candidate x positions across the middle 22–78% of the page, counting
   how many lines straddle each.
2. Treats positions crossed by ≤15% of lines as gutter candidates. The
   allowance matters: nearly every two-column resume has a full-width name
   header or section banner, and requiring a completely clear channel lets one
   wide header suppress column detection for the whole page.
3. Picks the candidate run that best **balances** content either side, with
   width only as a tiebreak. Choosing the widest run instead selects the empty
   right margin beyond the longest line, which splits the page into
   "everything" and "nothing".
4. Splits the page into horizontal bands at lines that genuinely span the
   gutter, and reads left-then-right within each band — so a mid-page
   full-width heading stays attached to the columns it introduces.

Single-column pages find no balanced gutter and fall through to plain
top-to-bottom ordering, unchanged.

### The `ResumeProfile` shape

```python
{
  "contact":     {"name", "email", "location", "links"},
  "education":   [{"institution", "degree", "field", "start", "end", "gpa"}],
  "experience":  [{"company", "title", "start", "end", "bullets": [...]}],
  "projects":    [{"name", "description", "tech": [...], "bullets": [...]}],
  "skills":      {"languages", "frameworks", "tools", "domains"},
  "certifications": [...],
  "seniority_signal": "junior" | "mid" | "senior",
  "parse_warnings": [...]
}
```

This is the enabling change for most of the roadmap. Question generation can
cite a specific bullet. Difficulty can start from `seniority_signal`. The
recruiter side can score against structured fields instead of a truncated blob,
which is what issue #9 actually needs.

---

## 6. Schema

```sql
-- sessions become time-boxed and stateful
alter table mock_interview_sessions
  add column target_role       text,
  add column company           text,
  add column duration_seconds  int  not null default 1800,
  add column status            text not null default 'in_progress',
  add column plan              jsonb,   -- phase budgets
  add column difficulty_tier   int  not null default 2,
  add column ended_at          timestamptz;

-- questions gain lineage, difficulty, and provenance
alter table mock_interview_questions
  add column parent_question_id  uuid references mock_interview_questions(id),
  add column phase               text,
  add column difficulty_tier     int,
  add column time_budget_seconds int,
  add column provenance          jsonb,
  add column asked_at            timestamptz;

-- answers gain a real rubric instead of one number
alter table mock_interview_answers
  add column rubric           jsonb,
  add column duration_seconds numeric,
  add column wpm              numeric;

create table mock_interview_resume_profiles (
  resume_id  uuid primary key references mock_interview_resumes(id) on delete cascade,
  profile    jsonb not null,
  parsed_at  timestamptz not null default now()
);

create table mock_interview_briefs (
  session_id uuid primary key references mock_interview_sessions(id) on delete cascade,
  status     text not null default 'pending',  -- pending|ready|failed
  brief      jsonb,
  question_bank jsonb,
  created_at timestamptz not null default now()
);
```

Questions are now written **one at a time as they are asked**, not nine at once.

---

## 7. API surface

Replaces the `question_number`-indexed endpoints, which assumed a fixed list.

```
POST /interview/sessions
     { resume_id, target_role, company?, duration_minutes }
     → { session_id, question, phase, time_budget, progress }

GET  /interview/sessions/{id}/state
     → current question, seconds remaining, phase, progress

POST /interview/sessions/{id}/answer      (audio already uploaded to storage)
     → { evaluation, next: question | null, done: bool }

POST /interview/sessions/{id}/end          early exit
GET  /interview/sessions/{id}/report
```

One round-trip per turn. No polling, no long-lived connections.

---

## 8. Scoring

The current final score has a bug that penalises everyone. `stress` starts at a
baseline of 50 and only increases, so a perfectly-paced answer (120–160 wpm)
scores exactly 50 — which `report_service` classifies as "Moderate Stress" and
docks 10% for. **Every well-paced candidate is silently penalised 10%.**

Replacing it:

- **Delivery is never a penalty.** Words-per-minute is reported to the candidate
  as private pace coaching and is excluded from the score entirely. Inferring
  emotional state from a candidate is prohibited under EU AI Act Article 5(1)(f)
  in workplace *and* educational contexts, so this stays a delivery metric and
  never becomes an affect signal.
- **Answer duration comes from Whisper**, not OpenCV. The transcription call
  already knows how long the audio is; `response_format="verbose_json"` returns
  it. This removes the video download and the `opencv-python-headless`
  dependency from the scoring path, and fixes wpm being computed against a
  hardcoded `duration = 60.0` fallback whenever the video probe fails.
- **The evaluator returns structured JSON**, via Groq's JSON mode rather than
  regex over prose:

```json
{
  "relevance": 0-10, "specificity": 0-10, "depth": 0-10, "structure": 0-10,
  "score": 0-10,
  "evidence_quotes": ["..."],
  "gaps": ["..."],
  "feedback": "...",
  "followup_recommended": true,
  "followup_question": "..."
}
```

The session score is the difficulty-weighted mean of per-answer scores — a 7/10
at expert tier is worth more than a 9/10 at foundational — with unanswered
questions excluded rather than zeroed.

---

## 9. Constraints worth knowing

- **deepagents requires Python ≥3.11.** `requirements.txt` currently claims
  3.10+. Railpack must be pinned.
- **deepagents pulls `langchain-anthropic` and `langchain-google-genai` as hard
  dependencies** even when neither provider is used. This is real image bloat on
  a container that otherwise only needs the Groq SDK.
- **Tavily and the agent model are the only paid/limited surfaces.** Both are
  confined to prep, which runs at most once per session and degrades to
  resume-only on failure.

---

## 10. Staging

| Stage | Scope                                                                    | Unblocks     |
| ----- | ------------------------------------------------------------------------ | ------------ |
| 0     | Fix the bugs that make interviews unusable today                          | everything   |
| 1     | Structured resume parsing + profile table                                 | #9, 2–4      |
| 2     | Duration-driven session schema, phase planner, difficulty staircase       | #10          |
| 3     | deepagents prep agent + Tavily grounding                                  | #10, #11     |
| 4     | Live adaptive loop: JIT questions, follow-ups, structured evaluation      | #10          |
| 5     | Honest scoring + report rewrite                                           | #12          |
| 6     | UI: session setup, live interview, report                                 | —            |

Stage 0 ships alone and first — none of the rest is observable while a session
cannot be completed.
