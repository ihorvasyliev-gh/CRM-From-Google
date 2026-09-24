-- ============================================================
-- Migration 66: Capacity in the viewer's "Upcoming sessions"
--
-- get_viewer_upcoming_courses() also returns the course's
-- max_capacity and whether that date is full, so viewers see
-- "confirmed / max" and a red "Full" badge.
--
-- is_full uses the same rule that blocks confirmations
-- (count_confirmed_for_date, migration 57): confirmed + completed
-- enrollments whose confirmed_date is that date >= max_capacity.
--
-- The return type changes, so the function is dropped and recreated;
-- the body is otherwise the same as migration 60.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

DROP FUNCTION IF EXISTS public.get_viewer_upcoming_courses();

CREATE FUNCTION public.get_viewer_upcoming_courses()
RETURNS TABLE (
    course_id UUID,
    course_name TEXT,
    course_date DATE,
    confirmed_count BIGINT,
    pending_count BIGINT,
    completed_count BIGINT,
    total_active_count BIGINT,
    max_capacity INT,
    is_full BOOLEAN
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
    ),
    counts AS (
        SELECT
            fd.course_id,
            c.name AS course_name,
            c.max_capacity,
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
            COUNT(e.id) FILTER (
                WHERE e.status = 'completed'
                  AND (e.confirmed_date = fd.course_date OR e.completed_date = fd.course_date)
            )::BIGINT AS completed_count,
            -- Same rule as count_confirmed_for_date (capacity enforcement)
            COUNT(e.id) FILTER (
                WHERE e.status IN ('confirmed', 'completed')
                  AND e.confirmed_date = fd.course_date
            )::BIGINT AS booked_count
        FROM future_dates fd
        JOIN public.courses c ON c.id = fd.course_id
        LEFT JOIN public.enrollments e ON e.course_id = fd.course_id
        GROUP BY fd.course_id, c.name, c.max_capacity, fd.course_date
    )
    SELECT
        ct.course_id,
        ct.course_name,
        ct.course_date,
        ct.confirmed_count,
        ct.pending_count,
        ct.completed_count,
        (ct.confirmed_count + ct.pending_count)::BIGINT AS total_active_count,
        ct.max_capacity,
        (ct.max_capacity IS NOT NULL AND ct.booked_count >= ct.max_capacity) AS is_full
    FROM counts ct
    WHERE ct.confirmed_count + ct.pending_count + ct.completed_count > 0
    ORDER BY ct.course_date ASC, ct.course_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_viewer_upcoming_courses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_viewer_upcoming_courses() TO authenticated;
