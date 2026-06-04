-- ============================================================
-- Migration 25: Security Hardening (Search Path & Execution Rights)
-- ============================================================

-- 1. Fix search_path for mutable search_path functions (CWE-426)
-- By default, Postgres functions without set search_path search using the caller's path.
-- We restrict them to 'public' to prevent hijacking.

-- Trigger functions & internal helpers
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_user_roles_updated_at_column() SET search_path = public;
ALTER FUNCTION public.trg_students_normalize_fn() SET search_path = public;
ALTER FUNCTION public.handle_new_user_role() SET search_path = public;
ALTER FUNCTION public.enforce_limited_user_enrollment_updates() SET search_path = public;

-- RPC functions
ALTER FUNCTION public.create_status_token(uuid) SET search_path = public;
ALTER FUNCTION public.resolve_status_token(text) SET search_path = public;
ALTER FUNCTION public.submit_employment_status(text, boolean, text, text, text, timestamptz) SET search_path = public;
ALTER FUNCTION public.submit_employment_status(text, text, boolean, text, text, text) SET search_path = public;
ALTER FUNCTION public.get_user_role() SET search_path = public;
ALTER FUNCTION public.search_students_enrollments(text) SET search_path = public;
ALTER FUNCTION public.mark_students_outcomes_invited(uuid[]) SET search_path = public;


-- 2. Revoke and Restrict API Execution Permissions
-- By default, public schema functions can be executed by anyone (PUBLIC role).
-- We revoke PUBLIC execute permission and grant it back explicitly to required roles only.

-- Revoke execute from PUBLIC on trigger functions & internal helpers (never executed via API)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_user_roles_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_students_normalize_fn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_limited_user_enrollment_updates() FROM PUBLIC;

-- Revoke execute from PUBLIC on all security definer RPC functions
REVOKE EXECUTE ON FUNCTION public.create_status_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_status_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_employment_status(text, boolean, text, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_employment_status(text, text, boolean, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_students_enrollments(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_students_outcomes_invited(uuid[]) FROM PUBLIC;

-- Revoke execute from PUBLIC on previously defined definer functions
REVOKE EXECUTE ON FUNCTION public.bulk_update_registration_dates(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_confirmation_token(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_course_info(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_students_outcomes_pending(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_students(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.public_confirm_enrollment(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_confirmation_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;


-- 3. Grant EXECUTE to specific target roles (anon/authenticated)

-- Admin-only RPCs (authenticated only)
GRANT EXECUTE ON FUNCTION public.create_status_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_students_enrollments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_students_outcomes_invited(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_registration_dates(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_confirmation_token(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_students_outcomes_pending(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_students(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- Public flows (both anon and authenticated)
GRANT EXECUTE ON FUNCTION public.resolve_status_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_employment_status(text, boolean, text, text, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_employment_status(text, text, boolean, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_course_info(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_confirm_enrollment(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_confirmation_token(text) TO anon, authenticated;
