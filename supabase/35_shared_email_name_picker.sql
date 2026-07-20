-- ============================================================
-- Migration 35: Shared Email — Name Picker Support
-- Fixes the issue where two students sharing the same email
-- (e.g. mother and son) cannot both confirm their enrollment.
-- ============================================================

-- ============================================================
-- 1. New RPC: find_students_by_email
-- Returns all students with a pending (invited, non-expired)
-- enrollment for a given course. Exposes only names — no
-- other personal data.
-- ============================================================
CREATE OR REPLACE FUNCTION find_students_by_email(p_email TEXT, p_course_id UUID)
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

-- ============================================================
-- 2. Updated RPC: public_confirm_enrollment
-- Adds optional p_student_id parameter so the confirmation
-- page can target a specific student when multiple share
-- the same email.
-- ============================================================
CREATE OR REPLACE FUNCTION public_confirm_enrollment(
    p_email TEXT,
    p_course_id UUID,
    p_student_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_updated_count INT;
BEGIN
    -- Find the student by email (case-insensitive + trim whitespace)
    IF p_student_id IS NOT NULL THEN
        -- Explicit student selected: validate that the email matches
        SELECT id INTO v_student_id
        FROM students
        WHERE id = p_student_id
          AND lower(trim(email)) = lower(trim(p_email));
    ELSE
        -- Legacy / single-student path: pick the first match
        SELECT id INTO v_student_id
        FROM students
        WHERE lower(trim(email)) = lower(trim(p_email));
    END IF;

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No student found with this email address.');
    END IF;

    -- Update enrollments that are in 'invited' status AND not expired
    UPDATE enrollments
    SET status         = 'confirmed',
        confirmed_date = invited_date,
        confirmed_at   = now()
    WHERE student_id = v_student_id
      AND course_id  = p_course_id
      AND status     = 'invited'
      AND (invited_at IS NULL OR invited_at + (COALESCE(response_days, 7) || ' days')::INTERVAL >= now());

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Your attendance has been confirmed! We look forward to seeing you.');
    END IF;

    -- Nothing was updated — determine why and return a helpful message

    -- 1. Already confirmed?
    IF EXISTS (
        SELECT 1 FROM enrollments
        WHERE student_id = v_student_id
          AND course_id = p_course_id
          AND status = 'confirmed'
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Your attendance has already been confirmed.');
    END IF;

    -- 2. Has expired invitation(s)?
    IF EXISTS (
        SELECT 1 FROM enrollments
        WHERE student_id = v_student_id
          AND course_id = p_course_id
          AND status = 'invited'
          AND invited_at IS NOT NULL
          AND invited_at + (COALESCE(response_days, 7) || ' days')::INTERVAL < now()
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Your invitation has expired. The confirmation window has passed. Please contact the organizer for a new invitation.'
        );
    END IF;

    -- 3. No matching invitation at all
    RETURN jsonb_build_object('success', false, 'message', 'No pending invitation found for this course. Please contact the organizer.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-grant access (idempotent)
REVOKE EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID) TO anon, authenticated;
