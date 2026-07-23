-- Initial schema for Mock'n-Hire, reverse-engineered from every
-- supabase.table(...)/.from(...) call in api/ and ui/ (there was no
-- migrations folder anywhere before this -- the schema only existed
-- implicitly in code). Applied to a brand-new, empty Supabase project.
--
-- Two independent domains share this database:
--   - Recruiter side: job_status, job_descriptions, resume_uploads,
--     resume_analysis, resume_rankings.
--   - Candidate/interview side: mock_interview_* tables.
-- Plus a shared `users` table (role: 'recruiter' | 'student', set at
-- signup by ui/lib/auth.ts).

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================
-- Shared: users (profile row per Supabase Auth user)
-- ============================================================
create table public.users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text,
  role       text not null check (role in ('recruiter', 'student')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Recruiter side
-- ============================================================
create table public.job_status (
  job_id     uuid primary key,
  status     text not null default 'pending' check (status in ('pending', 'complete')),
  created_at timestamptz not null default now()
);

create table public.job_descriptions (
  job_id             uuid primary key,
  user_id            uuid not null references public.users(user_id) on delete cascade,
  job_title          text not null,
  job_description    text not null,
  experience_weight  int not null default 1,
  project_weight     int not null default 1,
  created_at         timestamptz not null default now()
);

create table public.resume_uploads (
  resume_id      uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(user_id) on delete cascade,
  job_id         uuid not null references public.job_descriptions(job_id) on delete cascade,
  file_name      text not null,
  file_path      text not null,
  candidate_name text,
  -- original_hash/status: read by routes/search_analytics.py's dedup-history
  -- feature, but nothing currently writes them (candidate_name similarly
  -- started nullable-in-practice per the repo audit). Kept nullable rather
  -- than invented with a default that would look like real data.
  original_hash  text,
  status         text,
  created_at     timestamptz not null default now()
);
create index resume_uploads_job_id_idx on public.resume_uploads(job_id);
create index resume_uploads_original_hash_idx on public.resume_uploads(original_hash);

create table public.resume_analysis (
  resume_id                  uuid primary key references public.resume_uploads(resume_id) on delete cascade,
  key_skills                 jsonb not null default '[]',
  overall_analysis           text not null default '',
  certifications_courses     jsonb not null default '[]',
  relevant_projects          jsonb not null default '[]',
  soft_skills                jsonb not null default '[]',
  overall_match_score        numeric not null default 0,
  projects_relevance_score   numeric not null default 0,
  experience_relevance_score numeric not null default 0,
  notes                      text,
  tagged_users               jsonb,
  updated_at                 timestamptz not null default now()
);

create table public.resume_rankings (
  resume_id      uuid not null references public.resume_uploads(resume_id) on delete cascade,
  job_id         uuid not null references public.job_descriptions(job_id) on delete cascade,
  rank           int not null,
  total_score    numeric not null,
  candidate_name text,
  status         text not null default 'pending' check (status in ('pending', 'shortlisted', 'waitlisted', 'declined')),
  notes          text,
  tagged_users   jsonb,
  primary key (resume_id, job_id)
);
create index resume_rankings_job_id_idx on public.resume_rankings(job_id);

-- ============================================================
-- Candidate / interview side
-- ============================================================
create table public.mock_interview_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role    text not null default 'student'
);

create table public.mock_interview_resumes (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.mock_interview_users(user_id) on delete cascade,
  file_path text not null,
  created_at timestamptz not null default now()
);
create index mock_interview_resumes_user_id_idx on public.mock_interview_resumes(user_id);

create table public.mock_interview_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.mock_interview_users(user_id) on delete cascade,
  resume_id      uuid references public.mock_interview_resumes(id) on delete set null,
  start_time     timestamptz not null default now(),
  end_time       timestamptz,
  status         text not null default 'in_progress',
  overall_score  numeric
);
create index mock_interview_sessions_user_id_idx on public.mock_interview_sessions(user_id);

create table public.mock_interview_questions (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.mock_interview_sessions(id) on delete cascade,
  question_text    text not null,
  category         text not null,
  question_number  int not null,
  is_answered      boolean not null default false,
  unique (session_id, question_number)
);

create table public.mock_interview_answers (
  session_id      uuid not null references public.mock_interview_sessions(id) on delete cascade,
  question_number int not null,
  answer_text     text,
  audio_url       text,
  score           numeric,
  feedback        text,
  primary key (session_id, question_number)
);

create table public.mock_interview_stress_analysis (
  session_id        uuid not null references public.mock_interview_sessions(id) on delete cascade,
  question_number   int not null,
  stress_score      numeric not null,
  stress_level      text not null check (stress_level in ('Low', 'Moderate', 'High')),
  individual_scores jsonb not null default '[]',
  primary key (session_id, question_number)
);

create table public.mock_interview_reports (
  session_id            uuid primary key references public.mock_interview_sessions(id) on delete cascade,
  overall_summary       text,
  final_score           numeric,
  recommendation        text,
  average_stress_score  numeric,
  average_stress_level  text,
  created_at            timestamptz not null default now()
);
