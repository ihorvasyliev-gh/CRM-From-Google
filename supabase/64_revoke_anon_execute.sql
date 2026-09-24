-- ============================================================
-- Migration 64: Revoke anonymous EXECUTE on internal RPCs
--
-- Earlier migrations did "REVOKE ... FROM PUBLIC; GRANT ... TO
-- authenticated", but Supabase's default privileges also grant
-- EXECUTE on every new function *directly* to anon, so revoking
-- from PUBLIC alone never took anon's access away. The database
-- linter (0028 anon_security_definer_function_executable) flags them.
--
-- 1. Functions meant for signed-in users only: revoke from anon.
--    Most already refuse anon with an auth.role() check; this makes
--    it explicit and closes the ones without a guard:
--      - public_decline_enrollment: anyone knowing a student's email
--        and a course id could withdraw / reschedule them
--        (migration 53 intended to close this).
--      - count_confirmed_for_date, get_enrollment_queue_position.
-- 2. Trigger functions: nobody needs to call them via the API.
--    PostgreSQL checks EXECUTE on a trigger function only when the
--    trigger is created, never when it fires, so this is safe.
--
-- Intentionally still public (used by the /confirm and /status pages
-- without login), so their linter warnings are expected:
--   public_confirm_enrollment, resolve_confirmation_token,
--   get_public_course_info, get_course_capacity, find_students_by_email,
--   find_employment_students_by_email, submit_employment_status,
--   submit_outreach_status.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

-- ------------------------------------------------------------
-- 1. Signed-in users only
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.count_confirmed_for_date(UUID, DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.approve_course_completion(UUID[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_course_completion(UUID[], TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_course_completion(UUID[], DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pending_completions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_course_enrollment_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_student_detail_restricted(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_students_restricted(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_viewer_courses() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_viewer_course_roster(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_viewer_upcoming_courses() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_viewer_students_directory(TEXT, UUID, TEXT, BOOLEAN, TEXT, INT, INT) FROM PUBLIC, anon;

-- ------------------------------------------------------------
-- 2. Trigger functions: not callable through the API at all
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.enforce_limited_user_enrollment_updates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
