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
- `api/` — FastAPI backend. Two apps: `api/api_service.py` (recruiter:
  resume upload/ranking) and `api/student/main.py` (candidate: interview
  flow, runs on :8001). Shared Supabase auth in `api/student/api/auth.py`.
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
  verification entirely; student routes had no auth at all. Now both backends
  verify via `supabase.auth.get_user()` and enforce resource ownership
  (`require_self`/`require_session_owner`/`require_recruiter`). Route
  protection re-enabled via `ui/middleware.ts`. (#7, merged)
- **Build/deploy:** dynamic routes updated to Next.js 15 async `params`; dead
  duplicate frontends (`ui/`-old, `new_frontend/`, `ui/project/`) deleted;
  framer-motion `onDrag` type conflicts resolved. Verified building in a
  Node-24 Linux container matching Vercel. (#14)

## Known issues still open

- No tests, no CI (issue #8). No `supabase/migrations/` — schema is only
  implicit in `.table(...)` calls, and there are no RLS policies (issue #8).
- `api/student/requirements.txt` was mis-encoded/uninstallable (issue #8).
- `OPENAI_API_KEY` must actually hold a **Groq** key (see `process_resumes.py`'s
  `base_url` trick) — a real footgun; no `.env.example` documents it (issue #8).

## Roadmap

Phased in issues #7–#12: security (#7 ✅) → cleanup + schema-as-code +
tests/CI (#8) → resume/role personalization + explainable recruiter scoring
(#9) → deepagents-based adaptive interview agent (#10) → Tavily company-style
question grounding (#11) → real longitudinal progress dashboard (#12).
