-- ============================================================
-- Migration 59: Multi-date invitations
-- One invitation can offer several dates of the same course
-- (e.g. Wed / Thu / Fri groups). The student picks a date on the
-- confirmation page; capacity is checked for the chosen date.
--
-- 1. enrollments.invited_dates DATE[]  (NULL = single-date invite;
--    invited_date keeps the earliest offered date for the board/reports).
-- 2. confirmation_tokens.course_dates DATE[]  (NULL = single-date link).
-- 3. create_confirmation_token_multi(course_id, dates[]).
-- 4. create_confirmation_token only reuses single-date tokens.
-- 5. resolve_confirmation_token also returns course_dates.
-- 6. public_confirm_enrollment gets p_course_date (the chosen date).
-- 7. get_viewer_upcoming_courses counts multi-date invites as pending
--    on every offered date.
--
-- NOTE: variables are assigned with ":=" on purpose (see migration 57).
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

-- ------------------------------------------------------------
-- 1-2. Columns
-- ------------------------------------------------------------
ALTER TABLE enrollments
ADD COLUMN IF NOT EXISTS invited_dates DATE[];

COMMENT ON COLUMN enrollments.invited_dates IS 'Dates offered in a multi-date invitation (NULL = single date in invited_date). Cleared on confirmation.';

ALTER TABLE confirmation_tokens
ADD COLUMN IF NOT EXISTS course_dates DATE[];

COMMENT ON COLUMN confirmation_tokens.course_dates IS 'Dates offered by a multi-date link (NULL = single date in course_date).';

-- ------------------------------------------------------------
-- 3. Multi-date token
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_confirmation_token_multi(p_course_id UUID, p_course_dates DATE[])
RETURNS TEXT AS $$
DECLARE
    v_dates    DATE[];
    v_token    TEXT;
    v_existing TEXT;
    v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_i        INT;
    v_attempts INT := 0;
BEGIN
    v_dates := (SELECT array_agg(DISTINCT d ORDER BY d) FROM unnest(p_course_dates) AS d WHERE d IS NOT NULL);

    IF v_dates IS NULL OR cardinality(v_dates) = 0 THEN
        RAISE EXCEPTION 'At least one course date is required.';
    END IF;

    -- A single date is just a normal link
    IF cardinality(v_dates) = 1 THEN
        RETURN public.create_confirmation_token(p_course_id, v_dates[1]);
    END IF;

    v_existing := (
        SELECT token
        FROM confirmation_tokens
        WHERE course_id = p_course_id
          AND course_dates = v_dates
          AND expires_at > now()
        LIMIT 1
    );

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

    INSERT INTO confirmation_tokens (token, course_id, course_date, course_dates)
    VALUES (v_token, p_course_id, v_dates[1], v_dates);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_confirmation_token_multi(UUID, DATE[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_confirmation_token_multi(UUID, DATE[]) TO authenticated;

-- ------------------------------------------------------------
-- 4. Single-date token: never reuse a multi-date link
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_confirmation_token(p_course_id UUID, p_course_date DATE)
RETURNS TEXT AS $$
DECLARE
    v_token    TEXT;
    v_existing TEXT;
    v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_i        INT;
    v_attempts INT := 0;
BEGIN
    v_existing := (
        SELECT token
        FROM confirmation_tokens
        WHERE course_id = p_course_id
          AND course_date = p_course_date
          AND course_dates IS NULL
          AND expires_at > now()
        LIMIT 1
    );

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

REVOKE EXECUTE ON FUNCTION public.create_confirmation_token(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_confirmation_token(UUID, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 5. resolve_confirmation_token: return all offered dates
--    (return type changes, so the function must be dropped first)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_confirmation_token(TEXT);

CREATE FUNCTION public.resolve_confirmation_token(p_token TEXT)
RETURNS TABLE(course_id UUID, course_date DATE, course_name TEXT, course_dates DATE[]) AS $$
BEGIN
    RETURN QUERY
    SELECT ct.course_id,
           ct.course_date,
           c.name,
           COALESCE(ct.course_dates, ARRAY[ct.course_date])
    FROM confirmation_tokens ct
    JOIN courses c ON c.id = ct.course_id
    WHERE ct.token = p_token
      AND ct.expires_at > now();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.resolve_confirmation_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_confirmation_token(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6. public_confirm_enrollment with a chosen date
--    Drop the 3-arg version so PostgREST has no ambiguous overload.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.public_confirm_enrollment(TEXT, UUID, UUID);

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
    v_max           INT;
    v_date          DATE;
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
            IF p_course_date IS NULL OR NOT (p_course_date = ANY(r.invited_dates)) THEN
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

REVOKE EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID, DATE) TO anon, authenticated;

-- ------------------------------------------------------------
-- 7. Viewer upcoming courses: multi-date invites are pending on every offered date
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_viewer_upcoming_courses()
RETURNS TABLE (
    course_id UUID,
    course_name TEXT,
    course_date DATE,
    confirmed_count BIGINT,
    pending_count BIGINT,
    total_active_count BIGINT
) AS $$
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    WITH future_dates AS (
        SELECT id.course_id, id.invite_date AS course_date
        FROM public.invite_dates id
        WHERE id.invite_date >= CURRENT_DATE

        UNION

        SELECT e.course_id, e.invited_date AS course_date
        FROM public.enrollments e
        WHERE e.invited_date >= CURRENT_DATE

        UNION

        SELECT e.course_id, d AS course_date
        FROM public.enrollments e, unnest(e.invited_dates) AS d
        WHERE e.invited_dates IS NOT NULL AND d >= CURRENT_DATE

        UNION

        SELECT e.course_id, e.confirmed_date AS course_date
        FROM public.enrollments e
        WHERE e.confirmed_date >= CURRENT_DATE
    )
    SELECT
        fd.course_id,
        c.name AS course_name,
        fd.course_date,
        COUNT(e.id) FILTER (
            WHERE e.status = 'confirmed'
              AND (e.confirmed_date = fd.course_date OR (e.confirmed_date IS NULL AND e.invited_date = fd.course_date))
        )::BIGINT AS confirmed_count,
        COUNT(e.id) FILTER (
            WHERE e.status = 'invited'
              AND (e.invited_date = fd.course_date OR fd.course_date = ANY(e.invited_dates))
              AND (e.invited_at IS NULL OR e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL >= now())
        )::BIGINT AS pending_count,
        (
            COUNT(e.id) FILTER (
                WHERE e.status = 'confirmed'
                  AND (e.confirmed_date = fd.course_date OR (e.confirmed_date IS NULL AND e.invited_date = fd.course_date))
            ) +
            COUNT(e.id) FILTER (
                WHERE e.status = 'invited'
                  AND (e.invited_date = fd.course_date OR fd.course_date = ANY(e.invited_dates))
                  AND (e.invited_at IS NULL OR e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL >= now())
            )
        )::BIGINT AS total_active_count
    FROM future_dates fd
    JOIN public.courses c ON c.id = fd.course_id
    LEFT JOIN public.enrollments e ON e.course_id = fd.course_id
    GROUP BY fd.course_id, c.name, fd.course_date
    ORDER BY fd.course_date ASC, c.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_viewer_upcoming_courses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_viewer_upcoming_courses() TO authenticated;
