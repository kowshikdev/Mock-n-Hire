-- Four buckets the application code depends on, none of which existed:
--   resumes                 -- recruiter side (api/api_service.py), public
--                              (a public URL is built directly:
--                              f"{SUPABASE_URL}/storage/v1/object/public/resumes/...")
--   mock.interview.resumes  -- candidate resume uploads. Only ever touched by
--                              the backend via student/utils/supabase_utils.py,
--                              which authenticates with SUPABASE_KEY (the
--                              service role key -- see student/config/settings.py),
--                              so it bypasses RLS entirely. No object policy
--                              needed for it to function; kept private.
--   mock.interview.answers  -- recorded audio answers, uploaded DIRECTLY from
--                              the browser (ui/app/interview/[sessionId]/
--                              interview-client.tsx calls
--                              supabase.storage.from_(...).upload() with the
--                              student's own session, not through the
--                              backend), so this one needs a real INSERT
--                              policy for authenticated users.
--   mock.interview.videos   -- same direct-upload path as answers.
--
-- Missing entirely, not misconfigured: every upload against these buckets
-- was failing with "Bucket not found" (404) before this migration.

insert into storage.buckets (id, name, public)
values
  ('resumes', 'resumes', true),
  ('mock.interview.resumes', 'mock.interview.resumes', false),
  ('mock.interview.answers', 'mock.interview.answers', false),
  ('mock.interview.videos', 'mock.interview.videos', false)
on conflict (id) do nothing;

-- Minimum bar: any authenticated user may upload into the two buckets the
-- frontend writes to directly. This does NOT yet check that the session_id
-- in the object path actually belongs to the uploading user -- doing that
-- properly means parsing (storage.foldername(name))[2] as a session_id and
-- joining against mock_interview_sessions.user_id, mirroring the backend's
-- require_session_owner check. Tracked as a follow-up; not blocking here
-- since backend routes still verify ownership before ever reading these
-- objects back out.
create policy "authenticated users can upload interview answers"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'mock.interview.answers');

create policy "authenticated users can upload interview videos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'mock.interview.videos');
