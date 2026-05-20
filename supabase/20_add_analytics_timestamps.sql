-- ============================================================
-- Add analytics timestamps for confirmed and completed statuses
-- Adds confirmed_at and completed_at to enrollments.
-- Updates public_confirm_enrollment to automatically record confirmed_at.
-- ============================================================

-- 1. Add confirmed_at and completed_at columns
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. Update public_confirm_enrollment to set confirmed_at
CREATE OR REPLACE FUNCTION public_confirm_enrollment(p_email text, p_course_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_student_id uuid;
    v_updated_count int;
    v_has_expired boolean;
BEGIN
    -- Find the student by email (case-insensitive)
    SELECT id INTO v_student_id
    FROM students
    WHERE lower(email) = lower(p_email);

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No student found with this email address.');
    END IF;

    -- Check if there is an expired invitation (invited_at older than response_days)
    SELECT EXISTS (
        SELECT 1 FROM enrollments
        WHERE student_id = v_student_id
          AND course_id = p_course_id
          AND status = 'invited'
          AND invited_at IS NOT NULL
          AND invited_at + (COALESCE(response_days, 7) || ' days')::interval < now()
    ) INTO v_has_expired;

    IF v_has_expired THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Your invitation has expired. The confirmation window has passed. Please contact the organizer for a new invitation.'
        );
    END IF;

    -- Update all enrollments for this student + course that are in 'invited' status
    -- and NOT expired (invited_at within response_days or invited_at is NULL for legacy records)
    UPDATE enrollments
    SET status = 'confirmed',
        confirmed_date = invited_date,
        confirmed_at = now()
    WHERE student_id = v_student_id
      AND course_id = p_course_id
      AND status = 'invited'
      AND (invited_at IS NULL OR invited_at + (COALESCE(response_days, 7) || ' days')::interval >= now());

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

-- Re-grant anonymous access
GRANT EXECUTE ON FUNCTION public_confirm_enrollment(text, uuid) TO anon;
