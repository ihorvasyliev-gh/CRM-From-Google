-- ============================================================
-- Migration 36: SQL Audit Fixes (BUG 1 - 5)
-- ============================================================

-- ------------------------------------------------------------
-- 1. BUG-1: Shared Email Support for Employment Status
-- ------------------------------------------------------------

-- RPC to find all students sharing a given email address
CREATE OR REPLACE FUNCTION find_employment_students_by_email(p_email TEXT)
RETURNS TABLE(student_id UUID, first_name TEXT, last_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.first_name, s.last_name
    FROM students s
    WHERE lower(trim(s.email)) = lower(trim(p_email))
    ORDER BY s.first_name, s.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.find_employment_students_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_employment_students_by_email(TEXT) TO anon, authenticated;

-- Updated submit_employment_status with optional p_student_id parameter
CREATE OR REPLACE FUNCTION submit_employment_status(
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
BEGIN
    IF p_student_id IS NOT NULL THEN
        SELECT id, email INTO v_student_id, v_student_email
        FROM students
        WHERE id = p_student_id
          AND lower(trim(email)) = lower(trim(p_email));
    ELSE
        SELECT id, email INTO v_student_id, v_student_email
        FROM students
        WHERE lower(trim(email)) = lower(trim(p_email))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This email address does not match any of our records. Please use the email you originally registered with.');
    END IF;

    INSERT INTO employment_status (student_id, email, is_working, started_month, field_of_work, employment_type, status, last_responded_at)
    VALUES (v_student_id, v_student_email, p_is_working, p_started_month, p_field, p_employment_type, 'responded', p_responded_at)
    ON CONFLICT (student_id)
    DO UPDATE SET
        email             = EXCLUDED.email,
        is_working        = EXCLUDED.is_working,
        started_month     = EXCLUDED.started_month,
        field_of_work     = EXCLUDED.field_of_work,
        employment_type   = EXCLUDED.employment_type,
        status            = 'responded',
        last_responded_at = EXCLUDED.last_responded_at;

    RETURN jsonb_build_object('success', true, 'message', 'Thank you! Your employment status has been recorded successfully.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO anon, authenticated;


-- ------------------------------------------------------------
-- 2. BUG-3: Cleanup Function for Expired Confirmation Tokens
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_expired_confirmation_tokens()
RETURNS INT AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM confirmation_tokens WHERE expires_at < now();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION cleanup_expired_confirmation_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_confirmation_tokens() TO authenticated;


-- ------------------------------------------------------------
-- 3. BUG-4: Create Confirmation Token with Iteration Guard
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_confirmation_token(p_course_id UUID, p_course_date DATE)
RETURNS TEXT AS $$
DECLARE
    v_token    TEXT;
    v_existing TEXT;
    v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_i        INT;
    v_attempts INT := 0;
BEGIN
    SELECT token INTO v_existing
    FROM confirmation_tokens
    WHERE course_id = p_course_id AND course_date = p_course_date AND expires_at > now()
    LIMIT 1;

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

REVOKE EXECUTE ON FUNCTION create_confirmation_token(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_confirmation_token(UUID, DATE) TO authenticated;


-- ------------------------------------------------------------
-- 4. BUG-5: Row-Level Locking in merge_students RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_students(p_primary_id UUID, p_duplicate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_primary students%ROWTYPE;
    v_duplicate students%ROWTYPE;
    
    v_enrollment RECORD;
    v_existing_id UUID;
    v_existing_status TEXT;
    
    v_flag RECORD;
    v_existing_flag_id UUID;
    v_existing_flag_comment TEXT;
    
    v_prim_emp_id UUID;
    v_prim_emp_status TEXT;
    v_prim_working BOOLEAN;
    v_prim_started TEXT;
    v_prim_field TEXT;
    v_prim_type TEXT;
    v_prim_invited TIMESTAMPTZ;
    v_prim_responded TIMESTAMPTZ;
    
    v_dup_emp_id UUID;
    v_dup_emp_status TEXT;
    v_dup_working BOOLEAN;
    v_dup_started TEXT;
    v_dup_field TEXT;
    v_dup_type TEXT;
    v_dup_invited TIMESTAMPTZ;
    v_dup_responded TIMESTAMPTZ;
BEGIN
    IF p_primary_id = p_duplicate_id THEN
        RAISE EXCEPTION 'Cannot merge a student into themselves.';
    END IF;

    -- Lock both student rows in deterministic order to prevent race conditions & deadlocks
    IF p_primary_id < p_duplicate_id THEN
        PERFORM id FROM students WHERE id = p_primary_id FOR UPDATE;
        PERFORM id FROM students WHERE id = p_duplicate_id FOR UPDATE;
    ELSE
        PERFORM id FROM students WHERE id = p_duplicate_id FOR UPDATE;
        PERFORM id FROM students WHERE id = p_primary_id FOR UPDATE;
    END IF;

    -- 1. Fetch details of both students
    SELECT * INTO v_primary FROM students WHERE id = p_primary_id;
    SELECT * INTO v_duplicate FROM students WHERE id = p_duplicate_id;
    
    IF v_primary.id IS NULL THEN
        RAISE EXCEPTION 'Primary student with ID % not found.', p_primary_id;
    END IF;
    IF v_duplicate.id IS NULL THEN
        RAISE EXCEPTION 'Duplicate student with ID % not found.', p_duplicate_id;
    END IF;

    -- 2. Consolidate Enrollments (handling unique index conflicts)
    FOR v_enrollment IN SELECT * FROM enrollments WHERE student_id = p_duplicate_id LOOP
        SELECT id, status INTO v_existing_id, v_existing_status
        FROM enrollments
        WHERE student_id = p_primary_id
          AND course_id = v_enrollment.course_id
          AND COALESCE(course_variant, '') = COALESCE(v_enrollment.course_variant, '');

        IF v_existing_id IS NOT NULL THEN
            IF (v_enrollment.status IN ('completed', 'confirmed') AND v_existing_status NOT IN ('completed', 'confirmed'))
               OR (v_enrollment.status = 'invited' AND v_existing_status IN ('requested', 'rejected', 'withdrawn'))
            THEN
                UPDATE enrollments
                SET status = v_enrollment.status,
                    invited_date = COALESCE(invited_date, v_enrollment.invited_date),
                    confirmed_date = COALESCE(confirmed_date, v_enrollment.confirmed_date),
                    completed_date = COALESCE(completed_date, v_enrollment.completed_date),
                    invited_at = COALESCE(invited_at, v_enrollment.invited_at),
                    confirmed_at = COALESCE(confirmed_at, v_enrollment.confirmed_at),
                    completed_at = COALESCE(completed_at, v_enrollment.completed_at),
                    notes = TRIM(CONCAT(COALESCE(notes, ''), ' ', COALESCE(v_enrollment.notes, '')))
                WHERE id = v_existing_id;
            END IF;
            
            DELETE FROM enrollments WHERE id = v_enrollment.id;
        ELSE
            UPDATE enrollments SET student_id = p_primary_id WHERE id = v_enrollment.id;
        END IF;
    END LOOP;

    -- 3. Consolidate Student Flags
    FOR v_flag IN SELECT * FROM student_flags WHERE student_id = p_duplicate_id LOOP
        SELECT id, comment INTO v_existing_flag_id, v_existing_flag_comment
        FROM student_flags
        WHERE student_id = p_primary_id AND course_id = v_flag.course_id
        LIMIT 1;

        IF v_existing_flag_id IS NOT NULL THEN
            UPDATE student_flags
            SET comment = CASE
                WHEN v_flag.comment IS NOT NULL AND v_existing_flag_comment IS NOT NULL AND v_flag.comment <> v_existing_flag_comment 
                    THEN v_existing_flag_comment || '; ' || v_flag.comment
                ELSE COALESCE(v_existing_flag_comment, v_flag.comment)
            END
            WHERE id = v_existing_flag_id;
            
            DELETE FROM student_flags WHERE id = v_flag.id;
        ELSE
            UPDATE student_flags SET student_id = p_primary_id WHERE id = v_flag.id;
        END IF;
    END LOOP;

    -- 4. Consolidate Employment Status
    SELECT id, status, is_working, started_month, field_of_work, employment_type, last_invited_at, last_responded_at
    INTO v_prim_emp_id, v_prim_emp_status, v_prim_working, v_prim_started, v_prim_field, v_prim_type, v_prim_invited, v_prim_responded
    FROM employment_status
    WHERE student_id = p_primary_id;

    SELECT id, status, is_working, started_month, field_of_work, employment_type, last_invited_at, last_responded_at
    INTO v_dup_emp_id, v_dup_emp_status, v_dup_working, v_dup_started, v_dup_field, v_dup_type, v_dup_invited, v_dup_responded
    FROM employment_status
    WHERE student_id = p_duplicate_id;

    IF v_prim_emp_id IS NOT NULL AND v_dup_emp_id IS NOT NULL THEN
        IF v_dup_emp_status = 'responded' AND v_prim_emp_status <> 'responded' THEN
            UPDATE employment_status
            SET is_working = v_dup_working,
                started_month = v_dup_started,
                field_of_work = v_dup_field,
                employment_type = v_dup_type,
                status = 'responded',
                last_invited_at = COALESCE(last_invited_at, v_dup_invited),
                last_responded_at = v_dup_responded
            WHERE id = v_prim_emp_id;
        ELSE
            UPDATE employment_status
            SET last_invited_at = COALESCE(last_invited_at, v_dup_invited),
                last_responded_at = COALESCE(last_responded_at, v_dup_responded)
            WHERE id = v_prim_emp_id;
        END IF;
        
        DELETE FROM employment_status WHERE id = v_dup_emp_id;
    ELSIF v_dup_emp_id IS NOT NULL THEN
        UPDATE employment_status SET student_id = p_primary_id WHERE id = v_dup_emp_id;
    END IF;

    -- 5. Delete Duplicate Student Profile
    DELETE FROM students WHERE id = p_duplicate_id;

    -- 6. Enrich Primary Student Info
    UPDATE students
    SET
        first_name = CASE
            WHEN length(COALESCE(v_duplicate.first_name, '')) > length(COALESCE(first_name, '')) THEN v_duplicate.first_name
            ELSE first_name
        END,
        last_name = CASE
            WHEN length(COALESCE(v_duplicate.last_name, '')) > length(COALESCE(last_name, '')) THEN v_duplicate.last_name
            ELSE last_name
        END,
        phone = COALESCE(phone, v_duplicate.phone),
        address = COALESCE(address, v_duplicate.address),
        eircode = COALESCE(eircode, v_duplicate.eircode),
        dob = COALESCE(dob, v_duplicate.dob),
        created_at = LEAST(created_at, v_duplicate.created_at)
    WHERE id = p_primary_id;

END;
$$;

REVOKE EXECUTE ON FUNCTION merge_students(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_students(UUID, UUID) TO authenticated;
