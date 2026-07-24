-- Tightens the two policies from the previous migration. As first written,
-- any authenticated user could upload into ANY session's folder inside
-- mock.interview.answers/videos -- the check only verified bucket_id, not
-- that the session_id embedded in the object path (answers/{session_id}/...,
-- videos/{session_id}/...) actually belongs to the uploader. That's a real
-- ownership gap, not just a style nit, so closing it now rather than
-- deferring: cheap here, and mirrors the backend's own
-- require_session_owner check (api/student/api/auth.py).

drop policy "authenticated users can upload interview answers" on storage.objects;
drop policy "authenticated users can upload interview videos" on storage.objects;

create policy "users can upload answers for their own session"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'mock.interview.answers'
    and exists (
      select 1 from public.mock_interview_sessions s
      where s.id::text = (storage.foldername(name))[2]
        and s.user_id = (select auth.uid())
    )
  );

create policy "users can upload videos for their own session"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'mock.interview.videos'
    and exists (
      select 1 from public.mock_interview_sessions s
      where s.id::text = (storage.foldername(name))[2]
        and s.user_id = (select auth.uid())
    )
  );
