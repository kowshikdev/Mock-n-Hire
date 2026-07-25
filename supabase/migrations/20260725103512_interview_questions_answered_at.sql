-- Stage 4 (live adaptive loop) needs the actual wall-clock time each question
-- was answered to recompute phase elapsed time on every turn, per
-- INTERVIEW_ARCHITECTURE.md's "recomputed from timestamps, not accumulated
-- estimates" invariant. is_answered alone (a bool) doesn't carry that.
alter table public.mock_interview_questions
  add column if not exists answered_at timestamptz;
