-- ============================================================
-- Public Confirmation RPCs
-- These functions allow unauthenticated users (students)
-- to confirm their enrollment via a link in the invitation email.
-- ============================================================

-- 1. Get course name by ID (public, read-only, safe)
CREATE OR REPLACE FUNCTION get_public_course_info(p_course_id uuid)
RETURNS TABLE(course_name text) AS $$
BEGIN
    RETURN QUERY
    SELECT c.name FROM courses c WHERE c.id = p_course_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Confirm enrollment by email + course_id
--    Finds the student, then finds their enrollment for this course
--    with status = 'invited', and updates it to 'confirmed'.
CREATE OR REPLACE FUNCTION public_confirm_enrollment(p_email text, p_course_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_student_id uuid;
    v_updated_count int;
BEGIN
    -- Find the student by email (case-insensitive)
    SELECT id INTO v_student_id
    FROM students
    WHERE lower(email) = lower(p_email);

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No student found with this email address.');
    END IF;

    -- Update all enrollments for this student + course that are in 'invited' status
    -- Set confirmed_date = invited_date (the course date, not today's date)
    UPDATE enrollments
    SET status = 'confirmed',
        confirmed_date = invited_date
    WHERE student_id = v_student_id
      AND course_id = p_course_id
      AND status = 'invited';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Check if already confirmed
        IF EXISTS (
            SELECT 1 FROM enrollments
            WHERE student_id = v_student_id
              AND course_id = p_course_id
              AND status = 'confirmed'
        ) THEN
            RETURN jsonb_build_object('success', true, 'message', 'Your attendance has already been confirmed.');
        END IF;

        RETURN jsonb_build_object('success', false, 'message', 'No pending invitation found for this course. Please contact the organizer.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Your attendance has been confirmed! We look forward to seeing you.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant anonymous access to these functions
GRANT EXECUTE ON FUNCTION get_public_course_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public_confirm_enrollment(text, uuid) TO anon;
