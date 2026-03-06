-- ============================================================
-- 7-Day Invitation Timer
-- Adds invited_at timestamp to track when invitation was sent.
-- Updates public_confirm_enrollment to reject expired invitations.
-- ============================================================

-- 1. Add invited_at column
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS invited_at timestamptz;

-- 2. Backfill existing invited enrollments with updated_at as best guess
UPDATE enrollments SET invited_at = updated_at WHERE status = 'invited' AND invited_at IS NULL;

-- 3. Update public_confirm_enrollment to check 7-day expiry
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

    -- Check if there is an expired invitation (invited_at older than 7 days)
    SELECT EXISTS (
        SELECT 1 FROM enrollments
        WHERE student_id = v_student_id
          AND course_id = p_course_id
          AND status = 'invited'
          AND invited_at IS NOT NULL
          AND invited_at + interval '7 days' < now()
    ) INTO v_has_expired;

    IF v_has_expired THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Your invitation has expired. The 7-day confirmation window has passed. Please contact the organizer for a new invitation.'
        );
    END IF;

    -- Update all enrollments for this student + course that are in 'invited' status
    -- and NOT expired (invited_at within 7 days or invited_at is NULL for legacy records)
    UPDATE enrollments
    SET status = 'confirmed',
        confirmed_date = invited_date
    WHERE student_id = v_student_id
      AND course_id = p_course_id
      AND status = 'invited'
      AND (invited_at IS NULL OR invited_at + interval '7 days' >= now());

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
