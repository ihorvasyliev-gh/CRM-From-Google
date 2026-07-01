-- ============================================================
-- Migration 34: Bulletproof Confirmation Flow
-- Fixes:
--   BUG-1: Expired variant blocking ALL enrollments for same course
--   BUG-2: Missing trim() in email comparison
-- ============================================================

-- Recreate public_confirm_enrollment with fixes
CREATE OR REPLACE FUNCTION public_confirm_enrollment(p_email TEXT, p_course_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_updated_count INT;
BEGIN
    -- Find the student by email (case-insensitive + trim whitespace)
    -- BUG-2 FIX: Added trim() to both sides for robustness
    SELECT id INTO v_student_id
    FROM students
    WHERE lower(trim(email)) = lower(trim(p_email));

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No student found with this email address.');
    END IF;

    -- BUG-1 FIX: Removed the early v_has_expired check that blocked ALL enrollments
    -- when ANY variant was expired. Instead, UPDATE only non-expired ones first,
    -- then check the reason for zero updates afterward.

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
REVOKE EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID) TO anon, authenticated;
