-- ============================================================
-- Migration: Add p_responded_at parameter to submit_employment_status
-- Run this on your existing Supabase database.
-- ============================================================

-- 1. Drop old function signature (old GRANT will also be dropped)
DROP FUNCTION IF EXISTS submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT);

-- 2. Re-create with new signature (p_responded_at added)
CREATE OR REPLACE FUNCTION submit_employment_status(
    p_email TEXT,
    p_is_working BOOLEAN,
    p_started_month TEXT DEFAULT NULL,
    p_field TEXT DEFAULT NULL,
    p_employment_type TEXT DEFAULT NULL,
    p_responded_at TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_student_email TEXT;
BEGIN
    SELECT id, email
    INTO v_student_id, v_student_email
    FROM students
    WHERE lower(trim(email)) = lower(trim(p_email))
    LIMIT 1;

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This email address does not match any of our records. Please use the email you originally registered with.');
    END IF;

    INSERT INTO employment_status (student_id, email, is_working, started_month, field_of_work, employment_type, status, last_responded_at)
    VALUES (v_student_id, v_student_email, p_is_working, p_started_month, p_field, p_employment_type, 'responded', p_responded_at)
    ON CONFLICT (student_id)
    DO UPDATE SET
        email = EXCLUDED.email,
        is_working = EXCLUDED.is_working,
        started_month = EXCLUDED.started_month,
        field_of_work = EXCLUDED.field_of_work,
        employment_type = EXCLUDED.employment_type,
        status = 'responded',
        last_responded_at = EXCLUDED.last_responded_at;

    RETURN jsonb_build_object('success', true, 'message', 'Thank you! Your employment status has been recorded successfully.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant to anon (new signature)
GRANT EXECUTE ON FUNCTION submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon;
