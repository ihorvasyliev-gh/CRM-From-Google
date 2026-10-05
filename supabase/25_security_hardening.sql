-- ============================================================
-- Migration 25: Security Hardening (Search Path & Execution Rights)
--
-- Several of these functions were created outside the numbered migrations
-- (in the Supabase dashboard) and do not exist on a fresh install. Each
-- statement runs only when its function exists, so a database that already
-- has them gets exactly the original changes.
-- ============================================================

-- 1. Fix search_path for mutable search_path functions (CWE-426)
-- By default, Postgres functions without set search_path search using the caller's path.
-- We restrict them to 'public' to prevent hijacking.

-- Trigger functions & internal helpers
DO $$
DECLARE
    item text[];
BEGIN
    FOREACH item SLICE 1 IN ARRAY ARRAY[
        ['public.update_updated_at_column()', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.update_user_roles_updated_at_column()', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.trg_students_normalize_fn()', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.handle_new_user_role()', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.enforce_limited_user_enrollment_updates()', 'ALTER FUNCTION %s SET search_path = public']
    ] LOOP
        IF to_regprocedure(item[1]) IS NOT NULL THEN
            EXECUTE format(item[2], item[1]);
        END IF;
    END LOOP;
END $$;

-- RPC functions
DO $$
DECLARE
    item text[];
BEGIN
    FOREACH item SLICE 1 IN ARRAY ARRAY[
        ['public.create_status_token(uuid)', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.resolve_status_token(text)', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.submit_employment_status(text, boolean, text, text, text, timestamptz)', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.submit_employment_status(text, text, boolean, text, text, text)', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.get_user_role()', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.search_students_enrollments(text)', 'ALTER FUNCTION %s SET search_path = public'],
        ['public.mark_students_outcomes_invited(uuid[])', 'ALTER FUNCTION %s SET search_path = public']
    ] LOOP
        IF to_regprocedure(item[1]) IS NOT NULL THEN
            EXECUTE format(item[2], item[1]);
        END IF;
    END LOOP;
END $$;


-- 2. Revoke and Restrict API Execution Permissions
-- By default, public schema functions can be executed by anyone (PUBLIC role).
-- We revoke PUBLIC execute permission and grant it back explicitly to required roles only.

-- Revoke execute from PUBLIC on trigger functions & internal helpers (never executed via API)
DO $$
DECLARE
    item text[];
BEGIN
    FOREACH item SLICE 1 IN ARRAY ARRAY[
        ['public.update_updated_at_column()', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.update_user_roles_updated_at_column()', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.trg_students_normalize_fn()', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.handle_new_user_role()', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.enforce_limited_user_enrollment_updates()', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC']
    ] LOOP
        IF to_regprocedure(item[1]) IS NOT NULL THEN
            EXECUTE format(item[2], item[1]);
        END IF;
    END LOOP;
END $$;

-- Revoke execute from PUBLIC on all security definer RPC functions
DO $$
DECLARE
    item text[];
BEGIN
    FOREACH item SLICE 1 IN ARRAY ARRAY[
        ['public.create_status_token(uuid)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.resolve_status_token(text)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.submit_employment_status(text, boolean, text, text, text, timestamptz)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.submit_employment_status(text, text, boolean, text, text, text)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.get_user_role()', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.search_students_enrollments(text)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.mark_students_outcomes_invited(uuid[])', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC']
    ] LOOP
        IF to_regprocedure(item[1]) IS NOT NULL THEN
            EXECUTE format(item[2], item[1]);
        END IF;
    END LOOP;
END $$;

-- Revoke execute from PUBLIC on previously defined definer functions
DO $$
DECLARE
    item text[];
BEGIN
    FOREACH item SLICE 1 IN ARRAY ARRAY[
        ['public.bulk_update_registration_dates(jsonb)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.create_confirmation_token(uuid, date)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.get_public_course_info(uuid)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.mark_students_outcomes_pending(uuid[])', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.merge_students(uuid, uuid)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.public_confirm_enrollment(text, uuid)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.resolve_confirmation_token(text)', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC'],
        ['public.rls_auto_enable()', 'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC']
    ] LOOP
        IF to_regprocedure(item[1]) IS NOT NULL THEN
            EXECUTE format(item[2], item[1]);
        END IF;
    END LOOP;
END $$;


-- 3. Grant EXECUTE to specific target roles (anon/authenticated)

-- Admin-only RPCs (authenticated only)
DO $$
DECLARE
    item text[];
BEGIN
    FOREACH item SLICE 1 IN ARRAY ARRAY[
        ['public.create_status_token(uuid)', 'GRANT EXECUTE ON FUNCTION %s TO authenticated'],
        ['public.search_students_enrollments(text)', 'GRANT EXECUTE ON FUNCTION %s TO authenticated'],
        ['public.mark_students_outcomes_invited(uuid[])', 'GRANT EXECUTE ON FUNCTION %s TO authenticated'],
        ['public.bulk_update_registration_dates(jsonb)', 'GRANT EXECUTE ON FUNCTION %s TO authenticated'],
        ['public.create_confirmation_token(uuid, date)', 'GRANT EXECUTE ON FUNCTION %s TO authenticated'],
        ['public.mark_students_outcomes_pending(uuid[])', 'GRANT EXECUTE ON FUNCTION %s TO authenticated'],
        ['public.merge_students(uuid, uuid)', 'GRANT EXECUTE ON FUNCTION %s TO authenticated'],
        ['public.get_user_role()', 'GRANT EXECUTE ON FUNCTION %s TO authenticated']
    ] LOOP
        IF to_regprocedure(item[1]) IS NOT NULL THEN
            EXECUTE format(item[2], item[1]);
        END IF;
    END LOOP;
END $$;

-- Public flows (both anon and authenticated)
DO $$
DECLARE
    item text[];
BEGIN
    FOREACH item SLICE 1 IN ARRAY ARRAY[
        ['public.resolve_status_token(text)', 'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated'],
        ['public.submit_employment_status(text, boolean, text, text, text, timestamptz)', 'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated'],
        ['public.submit_employment_status(text, text, boolean, text, text, text)', 'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated'],
        ['public.get_public_course_info(uuid)', 'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated'],
        ['public.public_confirm_enrollment(text, uuid)', 'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated'],
        ['public.resolve_confirmation_token(text)', 'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated']
    ] LOOP
        IF to_regprocedure(item[1]) IS NOT NULL THEN
            EXECUTE format(item[2], item[1]);
        END IF;
    END LOOP;
END $$;
