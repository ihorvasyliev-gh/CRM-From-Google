-- ============================================================
-- Migration 45: Public Decline / Reschedule Enrollment RPC
-- Allows invited/confirmed students to decline attendance:
-- 1. 'reschedule' -> Moves back to 'requested' (waiting list for next group)
-- 2. 'withdraw'   -> Marks enrollment as 'withdrawn' (cancelled)
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_decline_enrollment(
    p_email TEXT,
    p_course_id UUID,
    p_action TEXT, -- 'reschedule' or 'withdraw'
    p_student_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_updated_count INT;
    v_action TEXT := lower(trim(coalesce(p_action, '')));
BEGIN
    -- Validate email input
    IF p_email IS NULL OR trim(p_email) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please enter a valid email address.');
    END IF;

    -- Validate course input
    IF p_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid course identifier.');
    END IF;

    -- Validate action
    IF v_action NOT IN ('reschedule', 'withdraw') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid action specified. Must be reschedule or withdraw.');
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
        RETURN jsonb_build_object('success', false, 'message', 'No registration found with this email address.');
    END IF;

    IF v_action = 'reschedule' THEN
        -- Move back to waiting list ('requested')
        IF p_student_id IS NOT NULL THEN
            UPDATE enrollments
            SET status         = 'requested',
                invited_date   = NULL,
                confirmed_date = NULL,
                invited_at     = NULL,
                confirmed_at   = NULL,
                notes          = trim(coalesce(notes, '') || E'\n' || 'Declined ' || coalesce(to_char(invited_date, 'DD/MM/YYYY'), 'date') || ' - requested future date on ' || to_char(now(), 'YYYY-MM-DD HH24:MI'))
            WHERE student_id = p_student_id
              AND course_id  = p_course_id
              AND status IN ('invited', 'confirmed');
        ELSE
            UPDATE enrollments e
            SET status         = 'requested',
                invited_date   = NULL,
                confirmed_date = NULL,
                invited_at     = NULL,
                confirmed_at   = NULL,
                notes          = trim(coalesce(e.notes, '') || E'\n' || 'Declined ' || coalesce(to_char(e.invited_date, 'DD/MM/YYYY'), 'date') || ' - requested future date on ' || to_char(now(), 'YYYY-MM-DD HH24:MI'))
            FROM students s
            WHERE e.student_id = s.id
              AND lower(trim(s.email)) = lower(trim(p_email))
              AND e.course_id  = p_course_id
              AND e.status IN ('invited', 'confirmed');
        END IF;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        IF v_updated_count > 0 THEN
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Thank you for letting us know! We have moved you back to the waiting list for future course dates.'
            );
        END IF;

    ELSIF v_action = 'withdraw' THEN
        -- Withdraw registration
        IF p_student_id IS NOT NULL THEN
            UPDATE enrollments
            SET status         = 'withdrawn',
                invited_date   = NULL,
                confirmed_date = NULL,
                notes          = trim(coalesce(notes, '') || E'\n' || 'Withdrawn by student on ' || to_char(now(), 'YYYY-MM-DD HH24:MI'))
            WHERE student_id = p_student_id
              AND course_id  = p_course_id
              AND status IN ('invited', 'confirmed', 'requested');
        ELSE
            UPDATE enrollments e
            SET status         = 'withdrawn',
                invited_date   = NULL,
                confirmed_date = NULL,
                notes          = trim(coalesce(e.notes, '') || E'\n' || 'Withdrawn by student on ' || to_char(now(), 'YYYY-MM-DD HH24:MI'))
            FROM students s
            WHERE e.student_id = s.id
              AND lower(trim(s.email)) = lower(trim(p_email))
              AND e.course_id  = p_course_id
              AND e.status IN ('invited', 'confirmed', 'requested');
        END IF;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        IF v_updated_count > 0 THEN
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Thank you for letting us know! Your registration has been cancelled.'
            );
        END IF;
    END IF;

    -- If no row updated, check if already in the target or terminal state
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'withdrawn'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Your registration has already been cancelled.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'requested'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'You are already on the waiting list for upcoming course dates.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'completed'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'You have already completed this course.');
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'No active invitation found to cancel.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) TO anon, authenticated;
