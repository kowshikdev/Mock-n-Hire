-- Interview sessions become time-boxed and stateful rather than a fixed list
-- of nine questions decided up front. See INTERVIEW_ARCHITECTURE.md.

alter table public.mock_interview_sessions
  add column if not exists target_role      text,
  add column if not exists company          text,
  -- 30 minutes. Every existing row was effectively a 9-question session with
  -- 120s per question, which is close enough that backfilling the default is
  -- honest rather than invented.
  add column if not exists duration_seconds integer not null default 1800,
  -- Phase budgets for this session, derived from duration at creation time.
  add column if not exists plan             jsonb,
  -- Current rung on the 2-down/1-up difficulty staircase, 1..5.
  add column if not exists difficulty_tier  integer not null default 2;

alter table public.mock_interview_sessions
  add constraint mock_interview_sessions_difficulty_tier_range
  check (difficulty_tier between 1 and 5) not valid;

alter table public.mock_interview_sessions
  add constraint mock_interview_sessions_duration_positive
  check (duration_seconds > 0) not valid;

-- Questions are now written one at a time as they are asked, and carry where
-- they came from.
alter table public.mock_interview_questions
  -- Follow-ups point at the question that provoked them, so a report can show
  -- the exchange rather than two unrelated-looking questions.
  add column if not exists parent_question_id  uuid references public.mock_interview_questions(id) on delete cascade,
  add column if not exists phase               text,
  add column if not exists difficulty_tier     integer,
  add column if not exists time_budget_seconds integer,
  -- Tavily grounding: source count, date range and urls. Null means the
  -- question was derived from the resume alone, which is a real distinction
  -- the candidate gets to see.
  add column if not exists provenance          jsonb,
  add column if not exists asked_at            timestamptz;

-- Answers carry the full rubric, not just one number.
alter table public.mock_interview_answers
  add column if not exists rubric           jsonb,
  add column if not exists duration_seconds numeric,
  add column if not exists wpm              numeric;

-- Parsed once per resume, reused by every session and by the recruiter path.
create table if not exists public.mock_interview_resume_profiles (
  resume_id uuid primary key references public.mock_interview_resumes(id) on delete cascade,
  profile   jsonb       not null,
  parsed_at timestamptz not null default now()
);

-- Output of the deepagents prep run. `status` lets the live interview check
-- whether grounding is ready yet without blocking on it.
create table if not exists public.mock_interview_briefs (
  session_id    uuid primary key references public.mock_interview_sessions(id) on delete cascade,
  status        text        not null default 'pending',
  brief         jsonb,
  question_bank jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint mock_interview_briefs_status_check
    check (status in ('pending', 'running', 'ready', 'failed'))
);

create index if not exists mock_interview_questions_session_number_idx
  on public.mock_interview_questions (session_id, question_number);

create index if not exists mock_interview_questions_parent_idx
  on public.mock_interview_questions (parent_question_id)
  where parent_question_id is not null;

-- RLS mirrors the existing tables exactly: owner-scoped SELECT only. All
-- writes go through the backend on the service role key.
alter table public.mock_interview_resume_profiles enable row level security;
alter table public.mock_interview_briefs          enable row level security;

drop policy if exists mock_interview_resume_profiles_select_own on public.mock_interview_resume_profiles;
create policy mock_interview_resume_profiles_select_own
  on public.mock_interview_resume_profiles
  for select
  using (exists (
    select 1 from public.mock_interview_resumes r
    where r.id = mock_interview_resume_profiles.resume_id
      and r.user_id = (select auth.uid())
  ));

drop policy if exists mock_interview_briefs_select_own on public.mock_interview_briefs;
create policy mock_interview_briefs_select_own
  on public.mock_interview_briefs
  for select
  using (exists (
    select 1 from public.mock_interview_sessions s
    where s.id = mock_interview_briefs.session_id
      and s.user_id = (select auth.uid())
  ));
