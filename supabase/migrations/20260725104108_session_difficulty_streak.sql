-- The 2-down/1-up staircase needs a streak counter (consecutive high scores)
-- alongside the tier, or "2 consecutive highs -> climb" can't be tracked
-- across stateless requests. See student/core/difficulty.py.
alter table public.mock_interview_sessions
  add column if not exists difficulty_streak integer not null default 0;
