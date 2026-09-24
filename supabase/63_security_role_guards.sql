-- ============================================================
-- Migration 63: Security fixes (role guards & public input checks)
--
-- Since migration 58 every new user is a 'viewer', but several
-- SECURITY DEFINER functions only checked "is authenticated", so a
-- viewer could call admin operations directly through the API.
--
-- 1. merge_students: admins only (a viewer could merge / delete any
--    student). The existing body is kept as merge_students_unchecked,
--    callable only through the guarded wrapper.
-- 2. create_confirmation_token / create_confirmation_token_multi /
--    cleanup_expired_confirmation_tokens: admins only.
-- 3. student_non_duplicates: RLS now excludes viewers (same rule as
--    every other admin table).
-- 4. submit_employment_status (public /status page): anonymous callers
--    can no longer backdate last_responded_at, and their answers are
--    validated (employment type, 'YYYY-MM' month, text length).
--    The Apps Script sync (service_role) behaves exactly as before.
-- 5. submit_outreach_status: same input validation.
-- 6. handle_enrollment_confirmed_push: the Edge Function URL is only
--    built from a request host that is exactly <project>.supabase.co,
--    so a forged Host / X-Forwarded-Host header can't redirect the
--    request (and its Authorization header) to another server.
--
-- NOTE: variables are assigned with ":=" on purpose (see migration 57).
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

-- ------------------------------------------------------------
-- 1. merge_students: admins only
-- ------------------------------------------------------------
DO $$
BEGIN
    -- Idempotent: only rename the first time this migration runs
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'merge_students_unchecked'
    ) THEN
        ALTER FUNCTION public.merge_students(UUID, UUID) RENAME TO merge_students_unchecked;
    END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.merge_students_unchecked(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.merge_students(p_primary_id UUID, p_duplicate_id UUID)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can merge students' USING ERRCODE = '42501';
    END IF;

    PERFORM public.merge_students_unchecked(p_primary_id, p_duplicate_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.merge_students(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_students(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 2. Confirmation tokens: admins only
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_confirmation_token(p_course_id UUID, p_course_date DATE)
RETURNS TEXT AS $$
DECLARE
    v_token    TEXT;
    v_existing TEXT;
    v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_i        INT;
    v_attempts INT := 0;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can create confirmation links' USING ERRCODE = '42501';
    END IF;

    v_existing := (
        SELECT token
        FROM confirmation_tokens
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
        FOR v_i IN 1..7 LOOP
            v_token := v_token || substr(v_chars, floor(random() * length(v_chars) + 1)::INT, 1);
        END LOOP;
        IF NOT EXISTS (SELECT 1 FROM confirmation_tokens WHERE token = v_token) THEN EXIT; END IF;
    END LOOP;

    INSERT INTO confirmation_tokens (token, course_id, course_date) VALUES (v_token, p_course_id, p_course_date);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_confirmation_token(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_confirmation_token(UUID, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_confirmation_token_multi(p_course_id UUID, p_course_dates DATE[])
RETURNS TEXT AS $$
DECLARE
    v_dates    DATE[];
    v_token    TEXT;
    v_existing TEXT;
    v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
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
        FROM confirmation_tokens
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
        FOR v_i IN 1..7 LOOP
            v_token := v_token || substr(v_chars, floor(random() * length(v_chars) + 1)::INT, 1);
        END LOOP;
        IF NOT EXISTS (SELECT 1 FROM confirmation_tokens WHERE token = v_token) THEN EXIT; END IF;
    END LOOP;

    INSERT INTO confirmation_tokens (token, course_id, course_date, course_dates)
    VALUES (v_token, p_course_id, v_dates[1], v_dates);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_confirmation_token_multi(UUID, DATE[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_confirmation_token_multi(UUID, DATE[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_expired_confirmation_tokens()
RETURNS INT AS $$
DECLARE
    v_deleted INT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can clean up confirmation links' USING ERRCODE = '42501';
    END IF;

    DELETE FROM confirmation_tokens WHERE expires_at < now();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_confirmation_tokens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_confirmation_tokens() TO authenticated;

-- ------------------------------------------------------------
-- 3. student_non_duplicates: no access for viewers
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated access" ON public.student_non_duplicates;
CREATE POLICY "Authenticated access" ON public.student_non_duplicates
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- ------------------------------------------------------------
-- 4. submit_employment_status: validate public answers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_employment_status(
    p_email           TEXT,
    p_is_working      BOOLEAN,
    p_started_month   TEXT        DEFAULT NULL,
    p_field           TEXT        DEFAULT NULL,
    p_employment_type TEXT        DEFAULT NULL,
    p_responded_at    TIMESTAMPTZ DEFAULT now(),
    p_student_id      UUID        DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_student_id    UUID;
    v_student_email TEXT;
    v_responded_at  TIMESTAMPTZ := now();
BEGIN
    IF auth.role() = 'service_role' THEN
        -- Google Form sync: keeps the form's own timestamp and free-form answers
        v_responded_at := COALESCE(p_responded_at, now());
    ELSE
        IF p_employment_type IS NOT NULL AND p_employment_type NOT IN ('full_time', 'part_time') THEN
            RETURN jsonb_build_object('success', false, 'message', 'Please select Full-time or Part-time.');
        END IF;
        IF p_started_month IS NOT NULL AND p_started_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Please select the month and year you started working.');
        END IF;
        IF length(p_field) > 200 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Please keep the place of work under 200 characters.');
        END IF;
    END IF;

    IF p_student_id IS NOT NULL THEN
        v_student_id := (
            SELECT id FROM students
            WHERE id = p_student_id
              AND lower(trim(email)) = lower(trim(p_email))
        );
    ELSE
        v_student_id := (
            SELECT id FROM students
            WHERE lower(trim(email)) = lower(trim(p_email))
            ORDER BY created_at DESC
            LIMIT 1
        );
    END IF;

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This email address does not match any of our records. Please use the email you originally registered with.');
    END IF;

    v_student_email := (SELECT email FROM students WHERE id = v_student_id);

    INSERT INTO employment_status (student_id, email, is_working, started_month, field_of_work, employment_type, status, last_responded_at)
    VALUES (v_student_id, v_student_email, p_is_working, p_started_month, p_field, p_employment_type, 'responded', v_responded_at)
    ON CONFLICT (student_id)
    DO UPDATE SET
        email             = EXCLUDED.email,
        is_working        = EXCLUDED.is_working,
        started_month     = EXCLUDED.started_month,
        field_of_work     = EXCLUDED.field_of_work,
        employment_type   = EXCLUDED.employment_type,
        status            = 'responded',
        last_responded_at = EXCLUDED.last_responded_at;

    RETURN jsonb_build_object('success', true, 'message', 'Thank you! Your employment status has been updated.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. submit_outreach_status: validate public answers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_outreach_status(
    p_list_id         UUID,
    p_email           TEXT,
    p_is_working      BOOLEAN,
    p_started_month   TEXT DEFAULT NULL,
    p_field           TEXT DEFAULT NULL,
    p_employment_type TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_contact_id UUID;
    v_first_name TEXT;
BEGIN
    IF p_employment_type IS NOT NULL AND p_employment_type NOT IN ('full_time', 'part_time') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please select Full-time or Part-time.');
    END IF;
    IF p_started_month IS NOT NULL AND p_started_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please select the month and year you started working.');
    END IF;
    IF length(p_field) > 200 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please keep the place of work under 200 characters.');
    END IF;

    v_contact_id := (
        SELECT id FROM public.outreach_contacts
        WHERE list_id = p_list_id
          AND lower(trim(email)) = lower(trim(p_email))
    );

    IF v_contact_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This email address does not match any of our records. Please use the email you originally registered with.');
    END IF;

    v_first_name := (SELECT first_name FROM public.outreach_contacts WHERE id = v_contact_id);

    UPDATE public.outreach_contacts
    SET is_working        = p_is_working,
        started_month     = p_started_month,
        field_of_work     = p_field,
        employment_type   = p_employment_type,
        status            = 'responded',
        last_responded_at = now()
    WHERE id = v_contact_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Thank you! Your employment status has been updated.',
        'first_name', v_first_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.submit_outreach_status(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_outreach_status(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6. Push trigger: only call a real <project>.supabase.co host
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_enrollment_confirmed_push()
RETURNS TRIGGER AS $$
DECLARE
    v_headers JSONB;
    v_auth_header TEXT;
    v_apikey TEXT;
    v_req_headers JSON;
    v_req_headers_text TEXT;
    v_host TEXT;
    v_url TEXT;
BEGIN
    -- Only trigger if the enrollment status changed to 'confirmed'
    IF (NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status <> 'confirmed')) THEN
        BEGIN
            v_headers := jsonb_build_object('Content-Type', 'application/json');

            -- Default URL to local Kong container
            v_url := 'http://kong:8000/functions/v1/send-push-notification';

            v_req_headers_text := current_setting('request.headers', true);

            IF v_req_headers_text IS NOT NULL AND v_req_headers_text <> '' THEN
                v_req_headers := v_req_headers_text::json;

                v_host := lower(COALESCE(v_req_headers ->> 'x-forwarded-host', v_req_headers ->> 'host'));
                v_auth_header := COALESCE(v_req_headers ->> 'authorization', v_req_headers ->> 'Authorization');
                v_apikey := COALESCE(v_req_headers ->> 'apikey', v_req_headers ->> 'ApiKey');

                IF v_auth_header IS NOT NULL THEN
                    v_headers := v_headers || jsonb_build_object('Authorization', v_auth_header);
                END IF;

                IF v_apikey IS NOT NULL THEN
                    v_headers := v_headers || jsonb_build_object('apikey', v_apikey);
                    -- Anonymous requests have no Authorization header: use the apikey as Bearer token
                    IF v_auth_header IS NULL THEN
                        v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_apikey);
                    END IF;
                END IF;

                -- Exactly "<project-ref>.supabase.co" (optionally with :443), nothing else
                IF v_host ~ '^[a-z0-9-]+\.supabase\.co(:443)?$' THEN
                    v_url := 'https://' || split_part(v_host, ':', 1) || '/functions/v1/send-push-notification';
                END IF;
            END IF;

            -- Async HTTP POST; failures never block the UPDATE
            PERFORM net.http_post(
                url := v_url,
                headers := v_headers,
                body := jsonb_build_object('enrollment_id', NEW.id)
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to trigger send-push-notification Edge Function: %', SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.handle_enrollment_confirmed_push() FROM PUBLIC, anon, authenticated;
