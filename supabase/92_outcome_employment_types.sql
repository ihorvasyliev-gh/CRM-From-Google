-- ============================================================
-- Migration 92: More employment types (Self-employed, CE / TUS)
--               and clear the "called, no answer" mark on reply
--
-- 1. outreach_contacts.employment_type now also allows
--    'self_employed' and 'ce_tus' alongside 'full_time' and 'part_time'.
-- 2. submit_employment_status and submit_outreach_status accept the
--    new types and clear called_no_answer_at when a reply arrives so
--    an old call mark never comes back on a later follow-up.
--
-- NOTE: variables are assigned with ":=" on purpose (see migration 57).
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Expand employment_type check on outreach_contacts
-- ------------------------------------------------------------
ALTER TABLE public.outreach_contacts
    DROP CONSTRAINT IF EXISTS outreach_contacts_employment_type_check;

ALTER TABLE public.outreach_contacts
    ADD CONSTRAINT outreach_contacts_employment_type_check
    CHECK (employment_type IN ('full_time', 'part_time', 'self_employed', 'ce_tus'));

-- ------------------------------------------------------------
-- 2. submit_employment_status: accept new types, clear call mark
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
        IF p_employment_type IS NOT NULL AND p_employment_type NOT IN ('full_time', 'part_time', 'self_employed', 'ce_tus') THEN
            RETURN jsonb_build_object('success', false, 'message', 'Please choose a type of work.');
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
            SELECT id FROM public.students
            WHERE id = p_student_id
              AND lower(trim(email)) = lower(trim(p_email))
        );
    ELSE
        v_student_id := (
            SELECT id FROM public.students
            WHERE lower(trim(email)) = lower(trim(p_email))
            ORDER BY created_at DESC
            LIMIT 1
        );
    END IF;

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This email address does not match any of our records. Please use the email you originally registered with.');
    END IF;

    v_student_email := (SELECT email FROM public.students WHERE id = v_student_id);

    INSERT INTO public.employment_status (student_id, email, is_working, started_month, field_of_work, employment_type, status, last_responded_at, called_no_answer_at)
    VALUES (v_student_id, v_student_email, p_is_working, p_started_month, p_field, p_employment_type, 'responded', v_responded_at, NULL)
    ON CONFLICT (student_id)
    DO UPDATE SET
        email               = EXCLUDED.email,
        is_working          = EXCLUDED.is_working,
        started_month       = EXCLUDED.started_month,
        field_of_work       = EXCLUDED.field_of_work,
        employment_type     = EXCLUDED.employment_type,
        status              = 'responded',
        last_responded_at   = EXCLUDED.last_responded_at,
        called_no_answer_at = NULL;

    RETURN jsonb_build_object('success', true, 'message', 'Thank you! Your employment status has been updated.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. submit_outreach_status: accept new types, clear call mark
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
    IF p_employment_type IS NOT NULL AND p_employment_type NOT IN ('full_time', 'part_time', 'self_employed', 'ce_tus') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please choose a type of work.');
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
    SET is_working          = p_is_working,
        started_month       = p_started_month,
        field_of_work       = p_field,
        employment_type     = p_employment_type,
        status              = 'responded',
        last_responded_at   = now(),
        called_no_answer_at = NULL
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

COMMIT;

NOTIFY pgrst, 'reload schema';
