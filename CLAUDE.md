# CLAUDE.md — Mock'n-Hire

## What this is

AI hiring suite: semantic resume screening for recruiters + resume-derived
practice interviews for candidates. Accepted at ICCCNT 2025.

Under active revamp — see the phased GitHub issues (#7–#12) and the "What's
actually true" section below before trusting any feature description.

## Stack

Monorepo: Next.js/TypeScript/Tailwind frontend (`ui/`) + FastAPI backend
(`api/`) + Supabase (Postgres, storage, auth). LLM calls go to Groq's
OpenAI-compatible endpoint. Three model env vars, each independently
configurable because a hardcoded model name has already broken production
once (see "Fixed already"): `LLM_MODEL` (default `llama-3.1-8b-instant`) for
fast per-turn calls, `AGENT_MODEL` (default `openai/gpt-oss-120b`) for the
deepagents prep agent, `STT_MODEL` (default `whisper-large-v3-turbo`) for
transcription. `TAVILY_API_KEY` is optional — unset means every interview
runs in generic (resume-only) mode instead of failing to start. Text-to-speech
adds `TTS_ENABLED`/`TTS_MODEL`/`TTS_VOICE`/`TTS_FORMAT`, all optional and all
on the same Groq key; unset behaves as before plus a voice, and any failure
falls back to the browser's own `speechSynthesis`.

## Design system

`DESIGN.md` at the repo root is the single source of truth for the UI:
an editorial off-white canvas (`#f5f5f5`) with warm near-black ink, display
type at weight 300, Inter for body, and soft pastel gradient orbs as the
only colour moment.

Non-negotiables, all encoded in `ui/tailwind.config.ts`:

- **There is no dark mode.** One fixed canvas — no `darkMode`, no theme
  provider, no toggle. Don't reintroduce `dark:` variants.
- **The ink pill is the only CTA colour.** No saturated brand action colour.
- **Display type never goes above weight 300.** Bolding it changes the brand
  voice from editorial to consumer-marketing.
- **Gradient orbs are decoration only** — never a button fill, text colour,
  or content container. `<Orb>` is always `pointer-events-none` +
  `aria-hidden`.
- Display face is **Cormorant Garamond 300**. Waldenburg is licensed;
  of DESIGN.md's named substitutes only a Garamond at 300 keeps the weight
  the system is built around (EB Garamond's lightest is 400).

`SECTION_DESIGN.md` describes a *different* brand ("Kresna": DM Sans +
Caveat, saturated blue). Only its footer **composition** is used — the skin
is DESIGN.md's. Its background `<video>` src points at a CloudFront asset on
someone else's account and is deliberately not shipped.

Primitives live in `ui/components/ui/`: `button`, `card`, `input`, `badge`,
`orb`, `section`, `states` (Loading/Empty/Error/Stat/Meter), `sonner`.
That's the whole set — it was 61 files before, 45 of them unreachable.

## Interview design

`INTERVIEW_ARCHITECTURE.md` at the repo root is the design of record for how a
practice interview is planned, conducted, and scored (issues #9–#12). The
short version:

- **Sessions are time-boxed, not question-boxed.** The candidate picks a
  duration (15/30/45 min); phase budgets
  (warmup/technical/behavioral/situational/closing) divide it, and the
  question count falls out of that — no longer a fixed nine.
  `student/core/session_planner.py` builds the plan and decides each turn's
  next phase from real `asked_at`/`answered_at` timestamps. Budgets are
  *internal*: the candidate sees one progress bar, never a per-question
  countdown, and is never cut off mid-answer.
- **It's a conversation, not a form.** The interviewer speaks each question
  (Groq TTS, browser `speechSynthesis` as fallback), the browser detects
  end-of-turn from ~1.6s of silence after sustained speech
  (`ui/lib/vad.ts`), and the next question follows. There is exactly one
  button in a session — "I'm ready" — and it exists only because browsers
  refuse to play audio without a user gesture.
- **Every interview opens with the same fixed self-introduction.**
  `session_planner.OPENING_QUESTION`, served with no LLM call. Generating it
  broke the one convention every candidate has rehearsed, put a Groq call on
  the critical path of session creation, and wasted the best grounding
  signal in the session. It also buys prep its runway (~45s research vs.
  60–90s of answer).
- **Latency is a design constraint, not an implementation detail.** On the
  critical path: transcription, `assess_turn` (score + claims + follow-up
  decision), and question generation *only* when the bank has nothing for
  that phase. Off it: the long-form rubric and archiving the answer audio.
  Serving a prepared question costs no LLM call at all. The numeric score
  stays synchronous because the difficulty staircase reads it; the
  background rubric pass deliberately cannot overwrite it.
- **A job description is optional but is the strongest grounding signal.**
  `groq_service.analyse_fit` compares résumé against role/JD into
  gap/partial/strength focus areas, and generated questions are steered at
  them, gaps first. Candidates keep up to 3 résumés with one default
  (`student/core/resume_library.py`), so a repeat session needs only a role.
- **Video is never recorded.** The camera preview stays; nothing is uploaded.
  Nothing read it, the feature that would have is prohibited (see below),
  and it cost a second MediaRecorder plus the bug surface that produced the
  stuck-spinner failure.
- **Two agents, deliberately different.** A **deepagents** prep agent
  (`student/agents/`) does the open-ended research (resume + role + company
  via Tavily) once per session in the background; the live interviewer
  (`student/api/routes/interview.py`) is plain Groq calls behind REST,
  because its control flow is fixed and a human is waiting on it. Do not
  merge them.
- **Discrete REST, one round-trip per turn.** `POST /interview/sessions` ->
  `POST /interview/sessions/{id}/turn` (repeated, audio in the request body)
  -> `GET /interview/sessions/{id}/report`. Not SSE — Railway caps SSE at 15
  minutes and a session runs longer. `/answer` is the deprecated predecessor,
  kept only because frontend and backend deploy independently.
- **Prep failure never blocks an interview.** The session opens on the fixed
  opener while prep runs in a `BackgroundTasks` job. Prep is two stages with
  very different reliability — a fast résumé-vs-JD fit pass (~2s, no external
  deps) and the Tavily research (minutes, network-dependent) — written
  separately, so a research failure downgrades the session to a JD-grounded
  interview rather than discarding everything. `mock_interview_briefs.status`
  is always driven to a terminal state by `student/core/prep_service.py`;
  the live loop only ever reads it, never waits on it.
- **The prep agent is never asked for structured output.** Both of
  langchain's strategies are unsound for a tool-using agent on Groq: JSON
  mode is rejected outright when tools are bound, and `ToolStrategy`'s forced
  `tool_choice` gets answered in prose by `gpt-oss-120b` (`tool_use_failed`).
  The agent ends in prose and a separate tool-free call serialises it. Don't
  reintroduce `response_format` on `create_deep_agent`.
- **Difficulty is a 2-down/1-up staircase** across 5 named tiers
  (`student/core/difficulty.py`), passed to the model as a tier name + a
  written behavioural anchor, never a bare number.
- **Delivery is never a penalty.** Speaking pace (`student/core/pace.py`) is
  private candidate-side coaching, excluded from `final_score` entirely —
  see "Fixed already" for the bug this replaced.
- **`final_score` is difficulty-weighted**, not a flat mean — a strong answer
  at a harder tier counts for more. Unanswered questions are excluded, never
  scored as 0.

## Layout (monorepo)

- `ui/` — Next.js frontend. **Vercel Root Directory must be set to `ui`**,
  not the repo root (that misconfiguration was the original deploy failure).
  Contains `app/`, `components/`, `lib/`, `hooks/`, and all frontend config.
- `api/` — FastAPI backend. **One app, one Railway service.**
  `api/api_service.py` is the sole entrypoint: recruiter routes (resume
  upload/ranking) are defined inline, candidate/interview routes
  (`/interview`, `/admin`) come from `api/student/api/routes/`
  and are mounted via `app.include_router(...)`. Was two separate FastAPI
  apps/Railway services (`api/student/main.py` ran standalone on :8001);
  merged to halve baseline compute cost since traffic doesn't yet justify
  independent scaling. `api/student/` code still imports via absolute
  `student.*` paths (e.g. `from student.utils.supabase_utils import ...`)
  so it resolves correctly with `api/` as the process root — if
  the interview flow's Whisper/video processing later needs independent
  scaling, extracting `api/student/` back into its own service just needs a
  new `railway.json` + root directory, no import rewrite.
- `assets/` — README screenshots.
- Root: `README.md`, `CLAUDE.md`, `LICENSE`, `.gitignore`. `supabase/`
  migrations land here (issue #8).

## What's actually true (audit findings — the README oversells)

- **The "MobileNetV2 emotion/stress detection" is not wired up.** The 22.7MB
  `.h5` model (`api/student/emotion_stress_model.h5`) is never loaded by any
  code path. The real "stress" signal is a words-per-minute heuristic off the
  Whisper transcript. Recruiter-facing emotion scoring is being dropped
  entirely — under **EU AI Act Article 5(1)(f) it is prohibited (not merely
  "high-risk") to infer emotions of a person in the workplace** since Feb
  2025, with recruitment a named 2026 enforcement priority. See closed
  issue #4. The WPM delivery signal is kept, reframed honestly as private
  candidate-side coaching.
- **"LLM + FAISS semantic matching" uses neither FAISS nor embeddings.**
  `sentence-transformers`/`faiss-cpu` are imported and never used. Ranking is
  a Groq LLM JSON verdict combining two 0–10 sub-scores. (issue #9 — this is
  the recruiter-side ranking, untouched by the candidate-side interview
  rewrite below)

## Fixed already

- **Auth (was a live hole):** `get_current_user` used to skip JWT signature
  verification entirely; student routes had no auth at all. Now both route
  sets verify via `supabase.auth.get_user()` and enforce resource ownership
  (`require_self`/`require_session_owner`/`require_recruiter`). Route
  protection re-enabled via `ui/middleware.ts`. (#7, merged)
- **Build/deploy:** dynamic routes updated to Next.js 15 async `params`; dead
  duplicate frontends (`ui/`-old, `new_frontend/`, `ui/project/`) deleted;
  framer-motion `onDrag` type conflicts resolved. Verified building in a
  Node-24 Linux container matching Vercel. (#14)
- **Railway deploy + backend consolidation:** `api/student/main.py` had no
  entry point at all (Railpack fell back to nothing); fixed, then the two
  backends were merged into one service entirely (see Layout above). CORS
  origins are now read from `ALLOWED_ORIGINS` (comma-separated) instead of a
  hardcoded `localhost:3000` — set it on Railway to the real deployed
  frontend origin. `opencv-python` (needs GUI system libs Railway's image
  lacks) swapped for `opencv-python-headless`. Both the recruiter and
  student LLM env vars consolidated into one `LLM_API_KEY` (was
  `OPENAI_API_KEY`/`GROQ_API_KEY` for the same underlying Groq key, read by
  two different SDKs). (#21–#24)
- **Frontend API base URL was hardcoded to `localhost`:** `lib/api.ts`,
  `lib/apiStudent.ts`, and two component call sites pointed at
  `localhost:4000`/`:8001` unconditionally — every backend call from the
  deployed frontend was silently broken regardless of backend health. Now
  reads `NEXT_PUBLIC_API_URL` (falls back to `localhost:4000` for local dev
  only). **Must be set in Vercel** to the Railway backend's public URL.

- **UI revamp:** every surface rebuilt on the DESIGN.md system. Alongside the
  restyle this removed fabricated marketing content (invented testimonials
  and usage statistics), a `session-history` page built entirely on six
  hardcoded fake sessions, and a Settings page whose save button toasted
  success while persisting nothing. Both now read/write real Supabase data.
  Also fixed: an `AuthProvider` redirect that bounced anonymous visitors off
  the public landing page, a student dashboard calling the recruiter-only
  `/admin/sessions` route (403 for every student), a results page hardcoding
  a *previous* Supabase project's URL, 0-10 scores rendered on 0-100 bars,
  and the `COMPLETE`/`complete` case mismatch that stopped the screening
  redirect from ever firing.
- **Chat model was hardcoded per-file** (`llama3-8b-8192` in
  `groq_service.py`/`report_service.py`, `mistral-saba-24b` in
  `process_resumes.py`). Groq decommissioned `llama3-8b-8192` outright,
  breaking every question-generation, answer-evaluation, and session-summary
  call with a `model_decommissioned` 400. Both now read one shared
  `LLM_MODEL` env var (default `llama-3.1-8b-instant`) — the next
  deprecation is an env var change, not a deploy. Check current IDs at
  https://console.groq.com/docs/models before changing it.
- **Auth session store mismatch:** `lib/supabase.ts` used the plain
  `createClient` (localStorage session), while `middleware.ts` reads the
  session from cookies via `createMiddlewareClient`. The two never saw each
  other, so every protected route bounced a "signed in" user back to
  `/auth/login`. Switched to `createClientComponentClient`. Was masked by
  the `AuthProvider` bug above until that was fixed, then became visible.
- **`size-*` utilities silently compiled to nothing.** The `size-*`
  shorthand needs Tailwind >= 3.4; this project is on 3.3.3. 46 occurrences
  across the revamp were replaced with `h-N w-N`. Don't reach for `size-*`
  until Tailwind is upgraded.
- **Storage buckets never existed.** `resumes`, `mock.interview.resumes`,
  `mock.interview.answers`, `mock.interview.videos` were referenced
  everywhere in code but never created — every resume/audio/video upload
  failed with a 404 "Bucket not found". Created via
  `supabase/migrations/20260724192429_storage_buckets_and_policies.sql`,
  with `mock.interview.answers`/`videos` further scoped so a user can only
  upload into their own session's folder
  (`20260724192552_scope_interview_storage_policies_to_session_owner.sql`) —
  the frontend uploads audio/video directly from the browser, not through
  the backend, so this needed real RLS, not just bucket creation.

- **The interview flow could not be completed at all.** A screenshot of a
  healthy 9-question session reading "Question 1 of 1", frozen on a spinner at
  0:00, turned out to be three separate bugs stacked:
  - The countdown effect listed `timeLeft` in its deps and returned no
    cleanup, so each tick started another interval on top of the last. Live
    timers doubled every second and a 2:00 budget drained in ~7s.
  - When it hit zero, `handleNextQuestion` assigned `.onstop` through a
    non-null assertion on both recorder refs. If recording had never started
    they were null, the promise never settled, and `loading` stayed true
    forever.
  - "1 of 1" was the page rendering `questions.length` (always 1 — questions
    are fetched one at a time) instead of the `total_questions` the API had
    been returning all along.
  Also in the same pass: `size-full`/`size-[88px]` survivors from the earlier
  Tailwind-3.3 `size-*` sweep, and skipped questions re-uploading the previous
  answer's audio because the chunk buffers were only cleared on record-start.
- **Every well-paced candidate was silently docked 10%.** `stress.py` started
  each answer at a baseline of 50 and only ever added to it, so an ideal
  120–160 wpm delivery scored exactly 50 — which `report_service` read as
  "Moderate Stress" and multiplied the final score by 0.9 for. Pace is now a
  deviation measure (0 = ideal) and is excluded from scoring entirely; see
  `INTERVIEW_ARCHITECTURE.md` §8 for why it stays out.
- **Structured LLM output instead of regex-over-markdown.** Question
  generation asked for `- **Technical:**` and parsed `**Technical:**`, so a
  model that followed the prompt exactly yielded zero questions; `max_tokens=500`
  risked truncating nine questions mid-list; and the cleanup regex's unanchored
  second branch deleted any digit-space pair anywhere ("5 years" → "years").
  Both generation and answer evaluation now use Groq JSON mode with validation,
  and a short question list fails loudly rather than producing a 90-second
  interview.
- **Every route in `interview.py` turned its own 4xx into a 500**, because the
  bodies were wrapped in `except Exception` which also caught the
  `HTTPException`s raised inside them. Asking for the question after the last
  one — how the client detects the end of an interview — logged a 500 on every
  completed session.
- Smaller ones in the same pass: `temp.pdf` written to a hardcoded path in the
  process CWD (two concurrent sessions raced over one filename), a full PDF
  parse per upload whose result was discarded, `on_conflict="session_id ,
  question_number"` (the space made it a nonexistent column),
  `UserSummaryResponse.weakest_question_types` typed `Dict[str, float]` while
  the service returned dicts (500 for every user with a completed session), a
  fabricated `5.0` score for sessions with no answers, and the dead duplicate
  `groq_whisper_service.py`. Transcription model is now `STT_MODEL`, for the
  same reason `LLM_MODEL` is.

- **The candidate's target role is no longer discarded** (issue #9,
  resolved by the interview rewrite below). `POST /interview/sessions` takes
  `target_role`/`company` directly and both flow through the whole pipeline:
  question generation, the prep agent's research, and the report.
- **Resume parsing rewritten and shared across both sides.** Reading order
  on two-column resumes needed line-level geometry and real gutter
  detection, not block-level sorting — `get_text("blocks")` merges text
  sharing a baseline, so a two-column resume's blocks hold *both* columns
  interleaved; the fix works on lines, scored on how well a candidate gutter
  position balances content either side. DOCX is now accepted on the
  candidate side (was PDF-only, while the recruiter side always took DOCX)
  and DOCX tables are read (`python-docx` doesn't surface table text via
  `.paragraphs`). Parsed once into a typed profile, cached in
  `mock_interview_resume_profiles`. See `api/resume_text.py`,
  `student/core/resume_parser.py`.
- **The whole fixed-nine-question interview replaced with a duration-driven,
  adaptive one** (issues #9–#12; design in `INTERVIEW_ARCHITECTURE.md`).
  `generate-questions`/`next-question`/`submit-answer` are gone, replaced by
  `POST /interview/sessions`, `GET .../state`, `POST .../answer`, `POST
  .../end`, `GET .../report`. Questions are generated one at a time, just in
  time; follow-ups are asked when the rubric shows relevant-but-vague (not
  just "could go deeper"), capped at one per question (two in technical) and
  never chained past one level deep. A **deepagents** prep agent grounds
  technical-phase questions in real research via Tavily when a company is
  named and `TAVILY_API_KEY` is set — cluster-and-rewrite, never verbatim
  reposting, with honest provenance (`source_count`, `date_range`) shown to
  the candidate. Evaluation is a full rubric
  (relevance/specificity/depth/structure/evidence_quotes/gaps), not a bare
  score. `stress.py` (an OpenCV video-duration probe feeding a "stress"
  score) is deleted entirely — `whisper_service.transcribe()` now returns
  audio duration directly from the transcription call already being made,
  and that duration drives `student/core/pace.py`'s delivery-pace figure,
  which stays out of `final_score` for the same EU AI Act reasoning as
  above.
- **No report had ever been generated, for anyone.** `report_service.py`
  embedded `mock_interview_sessions -> mock_interview_users -> users` to get
  the candidate's name. That relationship does not exist: both
  `mock_interview_users.user_id` and `public.users.user_id` are foreign keys
  onto `auth.users.id`, making the two tables *siblings* with no FK between
  them, so PostgREST returned `PGRST200` on every call and
  `mock_interview_reports` held zero rows. An earlier pass "fixed" how
  deeply that response was read — a fix to a line that could never run,
  because the nesting had been verified with raw SQL, which proves the data
  relationship exists but says nothing about whether PostgREST can follow it.
  Now a direct lookup on `users` by the auth uid the session already stores.
  **Verify PostgREST embeds by issuing the actual `.select()` string, not by
  reasoning about the schema.**

## Known issues still open

- No tests, no CI (issue #8).
- **`weight_certifications` is still not wired** (issue #9). The third
  weight slider was removed from the new-screening modal for the same
  reason — the FastAPI endpoint never declared the field, so the value was
  silently dropped by request parsing and the ranking ignored it. The
  certifications a resume lists are shown as evidence, but are explicitly
  labelled as not part of the score.
- Pre-existing route collision (not introduced by the merge): `api_service.py`'s
  own `@app.get("/export")` is unreachable — `routes/search_analytics.py`'s
  `/export` is registered first via `include_router` and wins. Not fixed here;
  flagging for issue #8's cleanup pass.

## Roadmap

Phased in issues #7–#12: security (#7 ✅) → cleanup + schema-as-code +
tests/CI (#8, still open) → resume/role personalization + explainable
recruiter scoring (#9, candidate side done — target role now flows through
end to end; recruiter-side certifications weight still not wired) →
deepagents-based adaptive interview agent (#10 ✅, prep agent + adaptive loop
shipped, not yet verified end to end against a live Groq key) → Tavily
company-style question grounding (#11 ✅, shipped as part of the same prep
agent) → real longitudinal progress dashboard (#12, `user-summary` endpoint
and session-history page exist; no dedicated trends/charts view yet).
