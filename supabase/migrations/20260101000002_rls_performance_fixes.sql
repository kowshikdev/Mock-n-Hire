-- Fixes surfaced by get_advisors(type="performance") immediately after the
-- RLS migration landed:
--   1. auth_rls_initplan (WARN, on every policy): bare auth.uid() calls get
--      re-evaluated per row; wrapping in (select auth.uid()) lets Postgres
--      evaluate it once per query instead. Real at scale, trivial to fix.
--   2. unindexed_foreign_keys (INFO, 3 tables): job_descriptions.user_id,
--      resume_uploads.user_id, mock_interview_sessions.resume_id had no
--      covering index.
-- (The "unused_index" INFO findings on the other hand are expected noise --
-- this is a brand-new, empty database with no query traffic yet -- not
-- acted on here.)

create index job_descriptions_user_id_idx on public.job_descriptions(user_id);
create index resume_uploads_user_id_idx on public.resume_uploads(user_id);
create index mock_interview_sessions_resume_id_idx on public.mock_interview_sessions(resume_id);

drop policy "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (user_id = (select auth.uid()));

drop policy "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert with check (user_id = (select auth.uid()));

drop policy "job_descriptions_select_own" on public.job_descriptions;
create policy "job_descriptions_select_own" on public.job_descriptions
  for select using (user_id = (select auth.uid()));

drop policy "job_status_select_own" on public.job_status;
create policy "job_status_select_own" on public.job_status
  for select using (
    exists (
      select 1 from public.job_descriptions jd
      where jd.job_id = job_status.job_id and jd.user_id = (select auth.uid())
    )
  );

drop policy "resume_uploads_select_own" on public.resume_uploads;
create policy "resume_uploads_select_own" on public.resume_uploads
  for select using (user_id = (select auth.uid()));

drop policy "resume_analysis_select_own" on public.resume_analysis;
create policy "resume_analysis_select_own" on public.resume_analysis
  for select using (
    exists (
      select 1 from public.resume_uploads ru
      where ru.resume_id = resume_analysis.resume_id and ru.user_id = (select auth.uid())
    )
  );

drop policy "resume_rankings_select_own" on public.resume_rankings;
create policy "resume_rankings_select_own" on public.resume_rankings
  for select using (
    exists (
      select 1 from public.job_descriptions jd
      where jd.job_id = resume_rankings.job_id and jd.user_id = (select auth.uid())
    )
  );

drop policy "resume_rankings_update_status_own" on public.resume_rankings;
create policy "resume_rankings_update_status_own" on public.resume_rankings
  for update using (
    exists (
      select 1 from public.job_descriptions jd
      where jd.job_id = resume_rankings.job_id and jd.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.job_descriptions jd
      where jd.job_id = resume_rankings.job_id and jd.user_id = (select auth.uid())
    )
  );

drop policy "mock_interview_users_select_own" on public.mock_interview_users;
create policy "mock_interview_users_select_own" on public.mock_interview_users
  for select using (user_id = (select auth.uid()));

drop policy "mock_interview_resumes_select_own" on public.mock_interview_resumes;
create policy "mock_interview_resumes_select_own" on public.mock_interview_resumes
  for select using (user_id = (select auth.uid()));

drop policy "mock_interview_sessions_select_own" on public.mock_interview_sessions;
create policy "mock_interview_sessions_select_own" on public.mock_interview_sessions
  for select using (user_id = (select auth.uid()));

drop policy "mock_interview_questions_select_own" on public.mock_interview_questions;
create policy "mock_interview_questions_select_own" on public.mock_interview_questions
  for select using (
    exists (
      select 1 from public.mock_interview_sessions s
      where s.id = mock_interview_questions.session_id and s.user_id = (select auth.uid())
    )
  );

drop policy "mock_interview_answers_select_own" on public.mock_interview_answers;
create policy "mock_interview_answers_select_own" on public.mock_interview_answers
  for select using (
    exists (
      select 1 from public.mock_interview_sessions s
      where s.id = mock_interview_answers.session_id and s.user_id = (select auth.uid())
    )
  );

drop policy "mock_interview_stress_analysis_select_own" on public.mock_interview_stress_analysis;
create policy "mock_interview_stress_analysis_select_own" on public.mock_interview_stress_analysis
  for select using (
    exists (
      select 1 from public.mock_interview_sessions s
      where s.id = mock_interview_stress_analysis.session_id and s.user_id = (select auth.uid())
    )
  );

drop policy "mock_interview_reports_select_own" on public.mock_interview_reports;
create policy "mock_interview_reports_select_own" on public.mock_interview_reports
  for select using (
    exists (
      select 1 from public.mock_interview_sessions s
      where s.id = mock_interview_reports.session_id and s.user_id = (select auth.uid())
    )
  );
