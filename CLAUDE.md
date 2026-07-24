# CLAUDE.md — Mock'n-Hire

## What this is

AI hiring suite: semantic resume screening for recruiters + resume-derived
practice interviews for candidates. Accepted at ICCCNT 2025.

Under active revamp — see the phased GitHub issues (#7–#12) and the "What's
actually true" section below before trusting any feature description.

## Stack

Monorepo: Next.js/TypeScript/Tailwind frontend (`ui/`) + FastAPI backend
(`api/`) + Supabase (Postgres, storage, auth). LLM calls go to Groq's
OpenAI-compatible endpoint, model set by `LLM_MODEL` (default
`llama-3.1-8b-instant` — see "Fixed already" for why this isn't hardcoded
anymore) + Whisper for transcription.

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

## Layout (monorepo)

- `ui/` — Next.js frontend. **Vercel Root Directory must be set to `ui`**,
  not the repo root (that misconfiguration was the original deploy failure).
  Contains `app/`, `components/`, `lib/`, `hooks/`, and all frontend config.
- `api/` — FastAPI backend. **One app, one Railway service.**
  `api/api_service.py` is the sole entrypoint: recruiter routes (resume
  upload/ranking) are defined inline, candidate/interview routes
  (`/interview`, `/stress`, `/admin`) come from `api/student/api/routes/`
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
  a Groq LLM JSON verdict combining two 0–10 sub-scores. (issue #9)
- **The candidate's typed target role is discarded** — every mock interview
  is generated from a hardcoded `"Software Engineer"` prompt. (issue #9)

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

## Known issues still open

- No tests, no CI (issue #8).
- **The candidate's target role is still discarded** (issue #9). The role
  input was removed from the student dashboard rather than left in place:
  it was collected and never sent anywhere, so it changed nothing. Restore
  it when `generate-questions` accepts a role.
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
tests/CI (#8) → resume/role personalization + explainable recruiter scoring
(#9) → deepagents-based adaptive interview agent (#10) → Tavily company-style
question grounding (#11) → real longitudinal progress dashboard (#12).
