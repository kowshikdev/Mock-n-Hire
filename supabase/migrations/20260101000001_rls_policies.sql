-- Row Level Security. Before this, every table above was fully exposed to
-- the anon/authenticated roles the Supabase client libraries use -- the
-- anon key given to the ui/ frontend could read or write any row in any
-- table, for any user. Verified via `list_tables`'s security advisory
-- immediately after the schema migration landed.
--
-- Design: the FastAPI backends (api/, api/student/) authenticate to
-- Supabase with the SERVICE ROLE key (see api/.env.example /
-- api/student/.env.example), which bypasses RLS entirely -- policies here
-- only govern what the ui/ frontend can do directly with the anon/
-- authenticated key. Grepping ui/ for every .insert/.update/.upsert/.delete
-- call found exactly two direct writes from the frontend (everything else
-- goes through the FastAPI backends): ui/lib/auth.ts's signup insert into
-- `users`, and the recruiter results page's direct status update on
-- `resume_rankings`. Those two get real write policies; every other table
-- is read-only for its owner from the frontend's perspective.

alter table public.users enable row level security;
alter table public.job_status enable row level security;
alter table public.job_descriptions enable row level security;
alter table public.resume_uploads enable row level security;
alter table public.resume_analysis enable row level security;
alter table public.resume_rankings enable row level security;
alter table public.mock_interview_users enable row level security;
alter table public.mock_interview_resumes enable row level security;
alter table public.mock_interview_sessions enable row level security;
alter table public.mock_interview_questions enable row level security;
alter table public.mock_interview_answers enable row level security;
alter table public.mock_interview_stress_analysis enable row level security;
alter table public.mock_interview_reports enable row level security;

-- ============================================================
-- users: read own profile; insert own profile at signup
-- (ui/lib/auth.ts's signUp() does supabase.from('users').insert(userData)
-- immediately after auth.signUp(), while already authenticated as the new
-- user -- auth.uid() is available for this insert).
-- ============================================================
create policy "users_select_own" on public.users
  for select using (user_id = auth.uid());

create policy "users_insert_own" on public.users
  for insert with check (user_id = auth.uid());

-- ============================================================
-- Recruiter side: every row is owned, directly or via job_descriptions,
-- by the recruiter who created the job. Read-only from the frontend
-- except resume_rankings.status (see below).
-- ============================================================
create policy "job_descriptions_select_own" on public.job_descriptions
  for select using (user_id = auth.uid());

create policy "job_status_select_own" on public.job_status
  for select using (
    exists (
      select 1 from public.job_descriptions jd
      where jd.job_id = job_status.job_id and jd.user_id = auth.uid()
    )
  );

create policy "resume_uploads_select_own" on public.resume_uploads
  for select using (user_id = auth.uid());

create policy "resume_analysis_select_own" on public.resume_analysis
  for select using (
    exists (
      select 1 from public.resume_uploads ru
      where ru.resume_id = resume_analysis.resume_id and ru.user_id = auth.uid()
    )
  );

create policy "resume_rankings_select_own" on public.resume_rankings
  for select using (
    exists (
      select 1 from public.job_descriptions jd
      where jd.job_id = resume_rankings.job_id and jd.user_id = auth.uid()
    )
  );

-- results-client.tsx updates status directly (recruiter marking a
-- candidate shortlisted/waitlisted/declined) -- only the status column,
-- and only for jobs the caller owns.
create policy "resume_rankings_update_status_own" on public.resume_rankings
  for update using (
    exists (
      select 1 from public.job_descriptions jd
      where jd.job_id = resume_rankings.job_id and jd.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.job_descriptions jd
      where jd.job_id = resume_rankings.job_id and jd.user_id = auth.uid()
    )
  );

-- ============================================================
-- Candidate / interview side: every row is owned, directly or via
-- mock_interview_sessions, by the candidate who ran the session.
-- Read-only from the frontend -- question generation, answer submission,
-- and stress analysis are all backend (service-role) writes.
-- ============================================================
create policy "mock_interview_users_select_own" on public.mock_interview_users
  for select using (user_id = auth.uid());

create policy "mock_interview_resumes_select_own" on public.mock_interview_resumes
  for select using (user_id = auth.uid());

create policy "mock_interview_sessions_select_own" on public.mock_interview_sessions
  for select using (user_id = auth.uid());

create policy "mock_interview_questions_select_own" on public.mock_interview_questions
  for select using (
    exists (
      select 1 from public.mock_interview_sessions s
      where s.id = mock_interview_questions.session_id and s.user_id = auth.uid()
    )
  );

create policy "mock_interview_answers_select_own" on public.mock_interview_answers
  for select using (
    exists (
      select 1 from public.mock_interview_sessions s
      where s.id = mock_interview_answers.session_id and s.user_id = auth.uid()
    )
  );

create policy "mock_interview_stress_analysis_select_own" on public.mock_interview_stress_analysis
  for select using (
    exists (
      select 1 from public.mock_interview_sessions s
      where s.id = mock_interview_stress_analysis.session_id and s.user_id = auth.uid()
    )
  );

create policy "mock_interview_reports_select_own" on public.mock_interview_reports
  for select using (
    exists (
      select 1 from public.mock_interview_sessions s
      where s.id = mock_interview_reports.session_id and s.user_id = auth.uid()
    )
  );
