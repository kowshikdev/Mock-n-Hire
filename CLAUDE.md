# CLAUDE.md — Mock'n-Hire

## What this is

AI hiring suite combining semantic resume screening with emotion-aware mock
interview feedback. Recruiters get customizable weighted candidate ranking;
candidates get resume-derived practice interviews with stress analysis.

Accepted at ICCCNT 2025 (16th Intl. Conference on Computing Communication and
Networking Technologies).

## Stack

Next.js · TypeScript · Tailwind · FastAPI · Supabase (Postgres, storage, auth) ·
sentence-transformers + FAISS · Keras/MobileNetV2 (stress detection)

## Layout

- `app/`, `components/`, `hooks/`, `lib/` — the **active** Next.js frontend
- `new_frontend/` — an **abandoned second frontend**. See below.
- `server/` — FastAPI backend and ML code
  - `server/student/emotion_stress_model.h5` (22.7 MB, committed)
- `middleware.disabled.ts` — disabled auth middleware, still in the tree

## ⚠️ Read before touching

**There are two frontends.** `app/` and `new_frontend/` are a migration that was
never finished. Decide which one is canonical and delete the other before doing
any UI work — otherwise you will edit the wrong one. Check git history for which
was touched last.

**`middleware.disabled.ts`** means auth middleware is currently bypassed. Find
out why it was disabled before re-enabling.

**The ML stack will not install as pinned.** `requirements.txt` has
`keras==2.11.0` (2022-era) and `python==3.10.11` as a pip requirement, which
isn't installable. The emotion model needs porting to a current TF/Keras or
being replaced outright.

## Ethical / regulatory note

Emotion-based scoring of job candidates is classified **high-risk** under the
EU AI Act, and emotion recognition in employment contexts is restricted. If this
project moves forward, address that directly — documented limitations, human
review in the loop, and an honest accuracy discussion. It is better to engage
with this openly than to have a reviewer raise it.

## Known issues

- No tests, no CI, no LICENSE.
- `.git` is ~30 MB (committed `.h5` model, sample PDFs/CSVs).
- Unpinned deps throughout apart from the two bad pins noted above.

## If you're scaling this

Delete the dead frontend → fix or replace the emotion model → resolve the
middleware → add the AI Act / fairness documentation. The resume-ranking half is
the stronger, less encumbered contribution and could stand alone.
