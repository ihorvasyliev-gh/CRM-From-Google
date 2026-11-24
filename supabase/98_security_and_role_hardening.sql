-- ============================================================
-- Migration 98: Security & Role Hardening
--
-- 1. Drop legacy public_decline_enrollment RPC (no longer used).
-- 2. Switch is_app_admin(), can_manage_pdf_forms(), and
--    can_manage_outreach() to positive role allowlists and wrap
--    auth.role()/auth.jwt() in (SELECT ...) for RLS initPlan.
-- 3. Guard approve_course_completion, reject_course_completion,
--    and get_pending_completions with public.is_app_admin().
-- 4. Restrict user_push_subscriptions RLS to admins only, remove
--    stale non-admin subscriptions, and clean up subscriptions
--    in set_user_role() whenever a user is not an admin.
-- 5. Revoke direct EXECUTE on trigger function
--    prevent_duplicate_course_enrollment().
-- 6. Allow GET/HEAD on /certificate_templates in
--    restrict_outreach_api_requests() so signed-in outreach/forms
--    users are not blocked when opening /certificates.
-- 7. Replace non-cryptographic random() with pgcrypto
--    gen_random_bytes() in create_confirmation_token() and
--    create_confirmation_token_multi().
-- 8. Add enrollments.confirmed_push_sent_at for atomic Edge
--    Function push notification deduplication.
-- 9. Attempt to tighten storage.objects policies for the
--    "templates" bucket to public.is_app_admin() (with safe
--    insufficient_privilege fallback + Dashboard verification
--    reminder).
--
-- Safe to run more than once (idempotent).
-- This file creates no tables: if the RLS warning appears,
-- choose "Run without RLS".
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop obsolete public_decline_enrollment RPC
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.public_decline_enrollment(TEXT, UUID, TEXT, UUID);

-- ------------------------------------------------------------
-- 2. Positive-allowlist role helpers with (SELECT auth.*())
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN AS $$
    SELECT (SELECT auth.role()) = 'authenticated'
       AND COALESCE(NULLIF((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', ''), 'admin') = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- Only reads the caller's JWT, so no SECURITY DEFINER. Callable by anon
-- (returns false) because RLS policies reference it.
CREATE OR REPLACE FUNCTION public.can_manage_pdf_forms()
RETURNS BOOLEAN AS $$
    SELECT (SELECT auth.role()) = 'authenticated'
       AND COALESCE(NULLIF((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', ''), 'admin') IN ('admin', 'forms');
$$ LANGUAGE sql STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_manage_pdf_forms() TO anon, authenticated;

-- External Lists (migration 69/75): admins, viewers, and outreach users — not forms or unknown roles
CREATE OR REPLACE FUNCTION public.can_manage_outreach()
RETURNS BOOLEAN AS $$
    SELECT (SELECT auth.role()) = 'authenticated'
       AND COALESCE(NULLIF((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', ''), 'admin') IN ('admin', 'viewer', 'outreach');
$$ LANGUAGE sql STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_manage_outreach() TO anon, authenticated;

-- ------------------------------------------------------------
-- 3. Admin-only guards on completion approval RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_course_completion(
    p_enrollment_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can approve completion requests' USING ERRCODE = '42501';
    END IF;

    IF p_enrollment_ids IS NULL OR array_length(p_enrollment_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No enrollments provided', 'updated_count', 0);
    END IF;

    UPDATE public.enrollments
    SET
        status = 'completed',
        completed_date = COALESCE(pending_completion_date, confirmed_date, invited_date, CURRENT_DATE),
        completed_at = now(),
        completion_request_status = 'approved',
        updated_at = now()
    WHERE id = ANY(p_enrollment_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_count,
        'message', format('Successfully approved completion for %s enrollment(s)', v_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.approve_course_completion(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_course_completion(UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_course_completion(
    p_enrollment_ids UUID[],
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can reject completion requests' USING ERRCODE = '42501';
    END IF;

    IF p_enrollment_ids IS NULL OR array_length(p_enrollment_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No enrollments provided', 'updated_count', 0);
    END IF;

    UPDATE public.enrollments
    SET
        completion_request_status = 'rejected',
        completion_rejection_reason = p_reason,
        updated_at = now()
    WHERE id = ANY(p_enrollment_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_count,
        'message', format('Successfully rejected completion for %s enrollment(s)', v_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reject_course_completion(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_course_completion(UUID[], TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pending_completions()
RETURNS TABLE (
    enrollment_id UUID,
    student_id UUID,
    student_name TEXT,
    student_email TEXT,
    student_phone TEXT,
    course_id UUID,
    course_name TEXT,
    course_variant TEXT,
    confirmed_date DATE,
    pending_completion_date DATE,
    completion_requested_at TIMESTAMPTZ,
    completion_requested_by TEXT
) AS $$
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can access pending approvals list' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        e.id AS enrollment_id,
        s.id AS student_id,
        (s.first_name || ' ' || s.last_name) AS student_name,
        s.email AS student_email,
        s.phone AS student_phone,
        c.id AS course_id,
        c.name AS course_name,
        e.course_variant,
        e.confirmed_date,
        e.pending_completion_date,
        e.completion_requested_at,
        e.completion_requested_by
    FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.completion_request_status = 'pending'
    ORDER BY e.completion_requested_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_pending_completions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_completions() TO authenticated;

-- ------------------------------------------------------------
-- 4. Push subscriptions: admins only + cleanup on role change
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.user_push_subscriptions;
DROP POLICY IF EXISTS "Admins can manage their own push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Admins can manage their own push subscriptions"
    ON public.user_push_subscriptions
    FOR ALL
    TO authenticated
    USING ((SELECT public.is_app_admin()) AND (SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT public.is_app_admin()) AND (SELECT auth.uid()) = user_id);

-- Purge any existing subscriptions owned by non-admin accounts
DELETE FROM public.user_push_subscriptions ups
WHERE EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = ups.user_id
      AND COALESCE(NULLIF(u.raw_app_meta_data ->> 'role', ''), 'admin') <> 'admin'
);

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID AS $$
DECLARE
    v_current TEXT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can change roles' USING ERRCODE = '42501';
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('viewer', 'outreach', 'forms', 'admin') THEN
        RAISE EXCEPTION 'Unknown role: %', p_role USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
        RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
    END IF;

    -- A missing role has always meant admin (see migration 58)
    v_current := COALESCE(NULLIF((SELECT u.raw_app_meta_data ->> 'role' FROM auth.users u WHERE u.id = p_user_id), ''), 'admin');

    IF v_current NOT IN ('viewer', 'outreach', 'forms') THEN
        RAISE EXCEPTION 'Admins can''t be changed to another role' USING ERRCODE = '22023';
    END IF;

    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role),
        updated_at = now()
    WHERE id = p_user_id;

    -- Remove push subscriptions whenever the target role is not admin
    IF p_role <> 'admin' AND to_regclass('public.user_push_subscriptions') IS NOT NULL THEN
        DELETE FROM public.user_push_subscriptions WHERE user_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 5. Revoke direct API execution of trigger function
-- ------------------------------------------------------------
DO $$
BEGIN
    IF to_regprocedure('public.prevent_duplicate_course_enrollment()') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_course_enrollment() FROM PUBLIC, anon, authenticated;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 6. PostgREST pre-request hook: allow /certificate_templates
--    reads so signed-in outreach/forms users can open /certificates
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restrict_outreach_api_requests()
RETURNS VOID AS $$
DECLARE
    v_role   TEXT;
    v_path   TEXT;
    v_method TEXT;
BEGIN
    v_role := COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '');
    IF v_role NOT IN ('outreach', 'forms') THEN
        RETURN;
    END IF;

    v_path   := COALESCE(current_setting('request.path', true), '');
    v_method := upper(COALESCE(current_setting('request.method', true), ''));

    IF v_path ~ '^/(pdf_form_templates|user_settings)/?$'
       OR (v_path ~ '^/certificate_templates/?$' AND v_method IN ('GET', 'HEAD')) THEN
        RETURN;
    END IF;

    IF v_role = 'outreach' AND (
        v_path ~ '^/(outreach_lists|outreach_contacts|outreach_contacts_view)/?$'
        OR v_path ~ '^/rpc/(import_outreach_contacts|mark_outreach_contacts_pending)/?$'
        OR (v_path ~ '^/email_opt_outs/?$' AND v_method IN ('GET', 'HEAD'))
    ) THEN
        RETURN;
    END IF;

    IF v_role = 'forms' THEN
        RAISE EXCEPTION 'Your account only has access to PDF Forms' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Your account only has access to External Lists and PDF Forms' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.restrict_outreach_api_requests() TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Cryptographically secure confirmation token generation
--    (pgcrypto lives in extensions on Supabase, public elsewhere)
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.create_confirmation_token(p_course_id UUID, p_course_date DATE)
RETURNS TEXT AS $$
DECLARE
    v_token    TEXT;
    v_existing TEXT;
    v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_len      INT  := length('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789');
    v_limit    INT  := 256 - (256 % length('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'));
    v_bytes    BYTEA;
    v_byte     INT;
    v_i        INT;
    v_attempts INT := 0;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can create confirmation links' USING ERRCODE = '42501';
    END IF;

    v_existing := (
        SELECT token
        FROM public.confirmation_tokens
        WHERE course_id = p_course_id
          AND course_date = p_course_date
          AND course_dates IS NULL
          AND expires_at > now()
        LIMIT 1
    );

    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

    LOOP
        v_attempts := v_attempts + 1;
        IF v_attempts > 100 THEN
            RAISE EXCEPTION 'Failed to generate a unique confirmation token after 100 attempts.';
        END IF;

        v_token := '';
        WHILE length(v_token) < 7 LOOP
            v_bytes := gen_random_bytes(16);
            FOR v_i IN 0..15 LOOP
                v_byte := get_byte(v_bytes, v_i);
                IF v_byte < v_limit THEN
                    v_token := v_token || substr(v_chars, (v_byte % v_len) + 1, 1);
                    EXIT WHEN length(v_token) = 7;
                END IF;
            END LOOP;
        END LOOP;

        IF NOT EXISTS (SELECT 1 FROM public.confirmation_tokens WHERE token = v_token) THEN EXIT; END IF;
    END LOOP;

    INSERT INTO public.confirmation_tokens (token, course_id, course_date)
    VALUES (v_token, p_course_id, p_course_date);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.create_confirmation_token(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_confirmation_token(UUID, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_confirmation_token_multi(p_course_id UUID, p_course_dates DATE[])
RETURNS TEXT AS $$
DECLARE
    v_dates    DATE[];
    v_token    TEXT;
    v_existing TEXT;
    v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_len      INT  := length('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789');
    v_limit    INT  := 256 - (256 % length('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'));
    v_bytes    BYTEA;
    v_byte     INT;
    v_i        INT;
    v_attempts INT := 0;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can create confirmation links' USING ERRCODE = '42501';
    END IF;

    v_dates := (SELECT array_agg(DISTINCT d ORDER BY d) FROM unnest(p_course_dates) AS d WHERE d IS NOT NULL);

    IF v_dates IS NULL OR cardinality(v_dates) = 0 THEN
        RAISE EXCEPTION 'At least one course date is required.';
    END IF;

    -- A single date is just a normal link
    IF cardinality(v_dates) = 1 THEN
        RETURN public.create_confirmation_token(p_course_id, v_dates[1]);
    END IF;

    v_existing := (
        SELECT token
        FROM public.confirmation_tokens
        WHERE course_id = p_course_id
          AND course_dates = v_dates
          AND expires_at > now()
        LIMIT 1
    );

    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

    LOOP
        v_attempts := v_attempts + 1;
        IF v_attempts > 100 THEN
            RAISE EXCEPTION 'Failed to generate a unique confirmation token after 100 attempts.';
        END IF;

        v_token := '';
        WHILE length(v_token) < 7 LOOP
            v_bytes := gen_random_bytes(16);
            FOR v_i IN 0..15 LOOP
                v_byte := get_byte(v_bytes, v_i);
                IF v_byte < v_limit THEN
                    v_token := v_token || substr(v_chars, (v_byte % v_len) + 1, 1);
                    EXIT WHEN length(v_token) = 7;
                END IF;
            END LOOP;
        END LOOP;

        IF NOT EXISTS (SELECT 1 FROM public.confirmation_tokens WHERE token = v_token) THEN EXIT; END IF;
    END LOOP;

    INSERT INTO public.confirmation_tokens (token, course_id, course_date, course_dates)
    VALUES (v_token, p_course_id, v_dates[1], v_dates);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.create_confirmation_token_multi(UUID, DATE[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_confirmation_token_multi(UUID, DATE[]) TO authenticated;

-- ------------------------------------------------------------
-- 8. Push notification deduplication column on enrollments
-- ------------------------------------------------------------
ALTER TABLE public.enrollments
    ADD COLUMN IF NOT EXISTS confirmed_push_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.enrollments.confirmed_push_sent_at IS
    'Timestamp stamped atomically by the send-push-notification Edge Function to prevent duplicate push alerts for the same confirmation.';

-- ------------------------------------------------------------
-- 9. Storage policies for the "templates" bucket
--
-- IMPORTANT ADMIN VERIFICATION:
-- Supabase SQL Editor roles often lack ownership of storage.objects,
-- so earlier migrations (73, 75) may have skipped updating policies
-- on the "templates" bucket. After running this migration, open
-- Supabase Dashboard -> Storage -> Policies -> "templates" and verify:
--   1. The "templates" bucket is PRIVATE (Public bucket = OFF).
--   2. Every policy on bucket_id = 'templates' (SELECT, INSERT,
--      UPDATE, DELETE) is restricted to authenticated admins via:
--        bucket_id = 'templates' AND public.is_app_admin()
--      so viewer, outreach, and forms users cannot read or modify
--      Word templates containing partner logos or signatures.
-- ------------------------------------------------------------
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow authenticated users to view templates" ON storage.objects;
    CREATE POLICY "Allow authenticated users to view templates" ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'templates' AND public.is_app_admin());

    DROP POLICY IF EXISTS "Allow authenticated users to upload templates" ON storage.objects;
    CREATE POLICY "Allow authenticated users to upload templates" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'templates' AND public.is_app_admin());

    DROP POLICY IF EXISTS "Allow authenticated users to update templates" ON storage.objects;
    CREATE POLICY "Allow authenticated users to update templates" ON storage.objects
        FOR UPDATE TO authenticated
        USING (bucket_id = 'templates' AND public.is_app_admin())
        WITH CHECK (bucket_id = 'templates' AND public.is_app_admin());

    DROP POLICY IF EXISTS "Allow authenticated users to delete templates" ON storage.objects;
    CREATE POLICY "Allow authenticated users to delete templates" ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'templates' AND public.is_app_admin());
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Could not update storage.objects policies for bucket "templates" due to insufficient_privilege. Verify in Supabase Dashboard -> Storage -> Policies that SELECT/INSERT/UPDATE/DELETE on bucket "templates" all require (bucket_id = ''templates'' AND public.is_app_admin()) and that the bucket is private.';
END $$;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
