-- ============================================================
-- Migration 57: Course Capacity (max participants per course date)
-- 1. Adds courses.max_capacity (NULL = unlimited).
-- 2. Adds public RPC get_course_capacity(course_id, date) used by the
--    confirmation page to show "X of Y places confirmed".
-- 3. Recreates public_confirm_enrollment so a confirmation is rejected
--    (code = 'course_full') once the course date is fully booked.
--    Time limits (response_days) still apply as before.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Column
-- ------------------------------------------------------------
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS max_capacity INTEGER;

ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_max_capacity_positive;
ALTER TABLE courses
ADD CONSTRAINT courses_max_capacity_positive CHECK (max_capacity IS NULL OR max_capacity > 0);

COMMENT ON COLUMN courses.max_capacity IS 'Maximum number of confirmed participants per course date (NULL = unlimited)';

-- Speeds up per-date confirmed counts
CREATE INDEX IF NOT EXISTS idx_enrollments_course_confirmed_date
    ON enrollments(course_id, confirmed_date)
    WHERE status IN ('confirmed', 'completed');

-- ------------------------------------------------------------
-- 2. Helper: confirmed participants for a course date
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_confirmed_for_date(p_course_id UUID, p_course_date DATE)
RETURNS INT AS $$
    SELECT COUNT(*)::INT
    FROM enrollments
    WHERE course_id = p_course_id
      AND confirmed_date = p_course_date
      AND status IN ('confirmed', 'completed');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.count_confirmed_for_date(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_confirmed_for_date(UUID, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 3. Public capacity lookup for the confirmation page
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_course_capacity(p_course_id UUID, p_course_date DATE)
RETURNS TABLE(max_capacity INT, confirmed_count INT, is_full BOOLEAN) AS $$
DECLARE
    v_max   INT;
    v_count INT;
BEGIN
    SELECT c.max_capacity INTO v_max FROM courses c WHERE c.id = p_course_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_count := CASE WHEN p_course_date IS NULL THEN 0
                    ELSE public.count_confirmed_for_date(p_course_id, p_course_date) END;

    RETURN QUERY SELECT v_max, v_count, (v_max IS NOT NULL AND p_course_date IS NOT NULL AND v_count >= v_max);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_course_capacity(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_course_capacity(UUID, DATE) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. public_confirm_enrollment with capacity enforcement
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_confirm_enrollment(
    p_email TEXT,
    p_course_id UUID,
    p_student_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_student_id    UUID;
    v_updated_count INT := 0;
    v_full_count    INT := 0;
    v_max           INT;
    r               RECORD;
BEGIN
    -- Validate email input
    IF p_email IS NULL OR trim(p_email) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please enter a valid email address.');
    END IF;

    -- Validate course input
    IF p_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid course identifier.');
    END IF;

    -- Lock the course row: serialises concurrent confirmations for the same
    -- course so two people can't both take the last place.
    SELECT max_capacity INTO v_max FROM courses WHERE id = p_course_id FOR UPDATE;
    IF NOT FOUND THEN
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

    -- Confirm pending (invited, not expired) enrollments while places remain
    FOR r IN
        SELECT e.id, e.invited_date
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.course_id = p_course_id
          AND e.status = 'invited'
          AND (e.invited_at IS NULL OR e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL >= now())
          AND (
                (p_student_id IS NOT NULL AND e.student_id = p_student_id)
             OR (p_student_id IS NULL AND lower(trim(s.email)) = lower(trim(p_email)))
          )
        ORDER BY e.created_at
    LOOP
        IF v_max IS NOT NULL
           AND r.invited_date IS NOT NULL
           AND public.count_confirmed_for_date(p_course_id, r.invited_date) >= v_max THEN
            v_full_count := v_full_count + 1;
            CONTINUE;
        END IF;

        UPDATE enrollments
        SET status         = 'confirmed',
            confirmed_date = invited_date,
            confirmed_at   = now()
        WHERE id = r.id;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    IF v_updated_count > 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Your attendance has been confirmed! We look forward to seeing you at the course.');
    END IF;

    -- Course date is fully booked
    IF v_full_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'course_full',
            'message', 'Sorry, all places for this course date have already been taken. Please contact the organizer to be prioritised for the next course.'
        );
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
