# CLAUDE.md — Mock'n-Hire

## What this is

AI hiring suite: semantic resume screening for recruiters + resume-derived
practice interviews for candidates. Accepted at ICCCNT 2025.

Under active revamp — see the phased GitHub issues (#7–#12) and the "What's
actually true" section below before trusting any feature description.

## Stack

Monorepo: Next.js/TypeScript/Tailwind frontend (`ui/`) + FastAPI backend
(`api/`) + Supabase (Postgres, storage, auth). LLM calls go to Groq's
OpenAI-compatible endpoint (`llama3-8b-8192`, `mistral-saba-24b`) + Whisper
for transcription.

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
  frontend origin. (#21, follow-up merge PR)

## Known issues still open

- No tests, no CI (issue #8).
- `OPENAI_API_KEY` must actually hold a **Groq** key (see `process_resumes.py`'s
  `base_url` trick) — a real footgun, now documented in `api/.env.example`
  alongside the separate native `GROQ_API_KEY` the student routes read directly.
- Pre-existing route collision (not introduced by the merge): `api_service.py`'s
  own `@app.get("/export")` is unreachable — `routes/search_analytics.py`'s
  `/export` is registered first via `include_router` and wins. Not fixed here;
  flagging for issue #8's cleanup pass.

## Roadmap

Phased in issues #7–#12: security (#7 ✅) → cleanup + schema-as-code +
tests/CI (#8) → resume/role personalization + explainable recruiter scoring
(#9) → deepagents-based adaptive interview agent (#10) → Tavily company-style
question grounding (#11) → real longitudinal progress dashboard (#12).
