-- Job descriptions on sessions, a real resume library, and the removal of
-- the last traces of the retired stress feature.
--
-- Context: an interview is usually against a specific job description, not
-- just a role title. A JD names the actual stack, seniority and
-- responsibilities that a role title only implies, so it is the strongest
-- grounding signal available to both the prep agent and the live loop.
-- It stays nullable -- a candidate practising for "Backend Engineer" with no
-- posting in hand is a first-class case, not a degraded one.

alter table public.mock_interview_sessions
  add column if not exists job_description text;

comment on column public.mock_interview_sessions.job_description is
  'Optional JD text the session is grounded against. Null means fall back to target_role/company.';


-- ---------------------------------------------------------------------
-- Resume library
-- ---------------------------------------------------------------------
-- Previously every session required a fresh upload: mock_interview_resumes
-- was an append-only log with no way to name, reuse or choose between
-- entries, so one test user had already accumulated four near-identical
-- copies of the same CV. Candidates keep a small number of tailored
-- resumes and pick between them, so the table becomes a library: named,
-- capped at three per user (enforced in the API, where a limit can be
-- explained), with exactly one marked default.

alter table public.mock_interview_resumes
  add column if not exists file_name  text,
  add column if not exists label      text,
  add column if not exists is_default boolean not null default false;

comment on column public.mock_interview_resumes.file_name is
  'Original upload filename. file_path is storage-keyed and timestamped, so it is not displayable.';
comment on column public.mock_interview_resumes.label is
  'Optional candidate-supplied name, e.g. "Backend-focused". Falls back to file_name in the UI.';

-- Recover a displayable name for rows that predate the column: file_path is
-- "<user_id>/<base>_<timestamp>.<ext>", so strip the directory and the
-- timestamp that upload_resume appended.
update public.mock_interview_resumes
set file_name = regexp_replace(
      regexp_replace(file_path, '^.*/', ''),
      '_[0-9]{14}(\.[A-Za-z]+)$', '\1'
    )
where file_name is null;

-- One default per user, enforced by the database rather than by whichever
-- code path happens to write last. A partial unique index is what makes
-- "set this one as default" safe to implement as clear-then-set.
create unique index if not exists mock_interview_resumes_one_default_per_user
  on public.mock_interview_resumes (user_id)
  where is_default;

-- Backfill: the most recent resume becomes each user's default, so existing
-- users land in a valid state instead of one where no resume is selectable.
update public.mock_interview_resumes r
set is_default = true
from (
  select distinct on (user_id) id
  from public.mock_interview_resumes
  order by user_id, created_at desc
) newest
where r.id = newest.id
  and not exists (
    select 1 from public.mock_interview_resumes d
    where d.user_id = r.user_id and d.is_default
  );


-- ---------------------------------------------------------------------
-- Retired stress feature
-- ---------------------------------------------------------------------
-- The emotion/stress path was removed in code some time ago: inferring
-- emotional state in a hiring context is prohibited outright by EU AI Act
-- Article 5(1)(f), not merely high-risk. The table and columns survived the
-- code deletion and have never held a row. Dropping them so the schema
-- stops advertising a capability the product deliberately does not have.

drop table if exists public.mock_interview_stress_analysis;

alter table public.mock_interview_reports
  drop column if exists average_stress_score,
  drop column if exists average_stress_level;
