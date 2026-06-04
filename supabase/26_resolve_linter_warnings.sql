-- ============================================================
-- Migration 26: Resolve Supabase Linter Warnings
-- ============================================================

-- 1. Drop Obsolete Functions
DROP FUNCTION IF EXISTS public.create_status_token(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.resolve_status_token(text) CASCADE;
DROP FUNCTION IF EXISTS public.mark_students_outcomes_invited(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.rls_auto_enable() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;

-- 2. Convert SQL functions to SECURITY INVOKER where possible
-- This runs them with the privileges of the calling user (CRM employee) which respects RLS.
ALTER FUNCTION public.bulk_update_registration_dates(jsonb) SECURITY INVOKER;
ALTER FUNCTION public.create_confirmation_token(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.mark_students_outcomes_pending(uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.merge_students(uuid, uuid) SECURITY INVOKER;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_students_enrollments') THEN
        ALTER FUNCTION public.search_students_enrollments(text) SECURITY INVOKER;
    END IF;
END $$;

-- 3. Explicitly revoke EXECUTE from PUBLIC, anon, and authenticated on trigger and internal helper functions
-- Trigger/helper functions should never be executed via client API (RPC).
-- Revoking execute from PUBLIC, anon, and authenticated ensures PostgREST/REST API cannot call them.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_students_normalize_fn() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_user_roles_updated_at_column') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.update_user_roles_updated_at_column() FROM PUBLIC, anon, authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_limited_user_enrollment_updates') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.enforce_limited_user_enrollment_updates() FROM PUBLIC, anon, authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user_role') THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated';
    END IF;
END $$;

-- 4. Clean up Storage policies on storage.objects for templates bucket
-- Since the templates bucket is public, the frontend will download files using the public URL.
-- This bypasses the need for SELECT policies on storage.objects, allowing us to drop the broad SELECT policy.
DROP POLICY IF EXISTS "Authenticated users can view templates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to list files" ON storage.objects;
