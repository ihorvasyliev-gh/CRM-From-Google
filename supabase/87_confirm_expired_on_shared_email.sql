-- ============================================================
-- Migration 87: The confirmation page no longer says "already
-- confirmed" to someone whose invitation expired
--
-- public_confirm_enrollment() looked for a reason when it confirmed
-- nothing, and checked "already confirmed" before "expired". Those
-- checks cover every person with the email when no one is chosen,
-- so with one email shared by two people (mother and son), or a
-- student with a second language on the course, an expired
-- invitation answered:
--     "Your attendance has already been confirmed!"
-- The page showed the green success screen, and the person stayed
-- in Invited. Now, while an invitation for the email has expired:
--   - nobody with a place: "Your invitation has expired" (as before)
--   - someone else has a place: says both, so neither person is
--     told something wrong.
--
-- Also: a multi-date invitation opened from an older single-date
-- link (the person was invited again with several dates) said
-- "Please choose one of the dates offered" with no dates to choose
-- from. It now asks for the link in the latest invitation email.
--
-- Everything else is as in migration 59.
--
-- NOTE: variables are assigned with ":=" on purpose (see migration 57).
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_confirm_enrollment(
    p_email TEXT,
    p_course_id UUID,
    p_student_id UUID DEFAULT NULL,
    p_course_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_student_id    UUID;
    v_updated_count INT := 0;
    v_full_count    INT := 0;
    v_invalid_count INT := 0;
    v_no_date_count INT := 0;
    v_max           INT;
    v_date          DATE;
    v_expired       BOOLEAN;
    v_has_place     BOOLEAN;
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
    PERFORM 1 FROM courses WHERE id = p_course_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid course identifier.');
    END IF;
    v_max := (SELECT max_capacity FROM courses WHERE id = p_course_id);

    -- Locate student
    IF p_student_id IS NOT NULL THEN
        v_student_id := (
            SELECT id
            FROM students
            WHERE id = p_student_id
              AND lower(trim(email)) = lower(trim(p_email))
        );
    ELSE
        v_student_id := (
            SELECT id
            FROM students
            WHERE lower(trim(email)) = lower(trim(p_email))
            ORDER BY created_at DESC
            LIMIT 1
        );
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
        SELECT e.id, e.invited_date, e.invited_dates
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
        -- Multi-date invitation: the student must pick one of the offered dates.
        -- Single-date invitation: the date on the enrollment is used (as before).
        IF r.invited_dates IS NOT NULL AND cardinality(r.invited_dates) > 0 THEN
            IF p_course_date IS NULL THEN
                -- Opened from a single-date link: there was nothing to pick from
                v_no_date_count := v_no_date_count + 1;
                CONTINUE;
            END IF;
            IF NOT (p_course_date = ANY(r.invited_dates)) THEN
                v_invalid_count := v_invalid_count + 1;
                CONTINUE;
            END IF;
            v_date := p_course_date;
        ELSE
            v_date := r.invited_date;
        END IF;

        IF v_max IS NOT NULL
           AND v_date IS NOT NULL
           AND public.count_confirmed_for_date(p_course_id, v_date) >= v_max THEN
            v_full_count := v_full_count + 1;
            CONTINUE;
        END IF;

        UPDATE enrollments
        SET status         = 'confirmed',
            invited_date   = v_date,
            invited_dates  = NULL,
            confirmed_date = v_date,
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

    -- Chosen date is not one of the offered dates
    IF v_invalid_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'invalid_date',
            'message', 'Please choose one of the dates offered in your invitation.'
        );
    END IF;

    -- A multi-date invitation opened from an older single-date link
    IF v_no_date_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'invalid_date',
            'message', 'This link is from an earlier invitation. Please open the link in your latest invitation email to choose your date.'
        );
    END IF;

    -- If nothing was updated, provide a helpful and precise reason.
    -- Without a chosen student these cover everyone with the email, so a place
    -- may be someone else's: an expired invitation is checked first.

    v_expired := EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'invited'
          AND e.invited_at IS NOT NULL
          AND e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL < now()
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    );

    v_has_place := EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status IN ('confirmed', 'completed')
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    );

    -- 1. Invitation expired
    IF v_expired THEN
        IF v_has_place THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'expired',
                'message', 'A place on this course is already confirmed for this email, but another invitation sent to it has expired. If you were confirming for someone else registered with this email, please contact the organizer for a new invitation.'
            );
        END IF;
        RETURN jsonb_build_object(
            'success', false,
            'code', 'expired',
            'message', 'Your invitation has expired. The confirmation window has passed. Please contact the organizer for a new invitation.'
        );
    END IF;

    -- 2. Already confirmed
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

    -- 3. Already completed
    IF v_has_place THEN
        RETURN jsonb_build_object('success', true, 'message', 'You have already completed this course.');
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

REVOKE EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID, DATE) TO anon, authenticated;
