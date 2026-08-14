-- ============================================================
-- Migration 39: Fix Already Confirmed Message & Function Overloads
-- 1. Drops old function overloads that cause PostgREST PGRST203 
--    (ambiguous function) errors when called with 2 arguments.
-- 2. Ensures public_confirm_enrollment returns a friendly success
--    message when attendance is already confirmed.
-- 3. Drops legacy overloads for submit_employment_status.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Clean up old function signatures for public_confirm_enrollment
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.public_confirm_enrollment(TEXT, UUID);
DROP FUNCTION IF EXISTS public.public_confirm_enrollment(TEXT, UUID, UUID);

-- ------------------------------------------------------------
-- 2. Clean up old function signatures for submit_employment_status
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID);

-- ------------------------------------------------------------
-- 3. Recreate find_students_by_email
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.find_students_by_email(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.find_students_by_email(p_email TEXT, p_course_id UUID)
RETURNS TABLE(student_id UUID, first_name TEXT, last_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.first_name, s.last_name
    FROM students s
    JOIN enrollments e ON e.student_id = s.id
    WHERE lower(trim(s.email)) = lower(trim(p_email))
      AND e.course_id = p_course_id
      AND e.status = 'invited'
      AND (e.invited_at IS NULL OR e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL >= now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.find_students_by_email(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_students_by_email(TEXT, UUID) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. Recreate public_confirm_enrollment with full friendly messages
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_confirm_enrollment(
    p_email TEXT,
    p_course_id UUID,
    p_student_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_updated_count INT;
BEGIN
    -- Validate email input
    IF p_email IS NULL OR trim(p_email) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please enter a valid email address.');
    END IF;

    -- Validate course input
    IF p_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid course identifier.');
    END IF;

    -- Locate student
    IF p_student_id IS NOT NULL THEN
        SELECT id INTO v_student_id
        FROM students
        WHERE id = p_student_id
          AND lower(trim(email)) = lower(trim(p_email));
    ELSE
        SELECT id INTO v_student_id
        FROM students
        WHERE lower(trim(email)) = lower(trim(p_email))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_student_id IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM students WHERE lower(trim(email)) = lower(trim(p_email))) THEN
            RETURN jsonb_build_object('success', false, 'message', 'No student found with this email address. Please check your email or contact the organizer.');
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Student record not found. Please try again.');
        END IF;
    END IF;

    -- Update enrollments in 'invited' status and not expired
    IF p_student_id IS NOT NULL THEN
        UPDATE enrollments
        SET status         = 'confirmed',
            confirmed_date = invited_date,
            confirmed_at   = now()
        WHERE student_id = p_student_id
          AND course_id  = p_course_id
          AND status     = 'invited'
          AND (invited_at IS NULL OR invited_at + (COALESCE(response_days, 7) || ' days')::INTERVAL >= now());
    ELSE
        UPDATE enrollments e
        SET status         = 'confirmed',
            confirmed_date = e.invited_date,
            confirmed_at   = now()
        FROM students s
        WHERE e.student_id = s.id
          AND lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id  = p_course_id
          AND e.status     = 'invited'
          AND (e.invited_at IS NULL OR e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL >= now());
    END IF;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Your attendance has been confirmed! We look forward to seeing you at the course.');
    END IF;

    -- If nothing was updated, provide a helpful and precise reason:

    -- 1. Already confirmed
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'confirmed'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Your attendance has already been confirmed! We look forward to seeing you at the course.');
    END IF;

    -- 2. Already completed
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'completed'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'You have already completed this course.');
    END IF;

    -- 3. Invitation expired
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'invited'
          AND e.invited_at IS NOT NULL
          AND e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL < now()
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Your invitation has expired. The confirmation window has passed. Please contact the organizer for a new invitation.'
        );
    END IF;

    -- 4. Requested (waiting list)
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'requested'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Your application is on the waiting list, but an invitation has not been sent yet. Please wait for your invitation email.'
        );
    END IF;

    -- 5. No enrollment for this course
    RETURN jsonb_build_object(
        'success', false,
        'message', 'No pending invitation found for this course. Please contact the organizer.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5. Recreate submit_employment_status
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

    RETURN jsonb_build_object('success', true, 'message', 'Thank you! Your employment status has been updated.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO anon, authenticated;
