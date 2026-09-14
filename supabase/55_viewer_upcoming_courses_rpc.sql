-- ============================================================
-- Migration 55: Viewer Upcoming Courses RPC
-- Provides upcoming course dates with confirmed and active pending counts
-- for the Viewer Portal header.
--
-- Features:
-- 1. Aggregates upcoming course sessions (course_date >= CURRENT_DATE)
--    from invite_dates and active enrollments.
-- 2. Calculates confirmed_count (confirmed students for that date).
-- 3. Calculates pending_count (invited students for that date whose
--    response_days timer has NOT expired).
-- 4. Excludes expired invitations automatically.
-- 5. Orders chronologically by course_date ASC, then course_name ASC.
-- 6. SECURITY DEFINER with authenticated role check.
-- ============================================================

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
        -- Distinct upcoming course dates from invite_dates table
        SELECT id.course_id, id.invite_date AS course_date
        FROM public.invite_dates id
        WHERE id.invite_date >= CURRENT_DATE

        UNION

        -- Distinct upcoming dates from invited enrollments
        SELECT e.course_id, e.invited_date AS course_date
        FROM public.enrollments e
        WHERE e.invited_date >= CURRENT_DATE

        UNION

        -- Distinct upcoming dates from confirmed enrollments
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
              AND e.invited_date = fd.course_date
              -- Check that the invitation response timer has NOT expired
              AND (e.invited_at IS NULL OR e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL >= now())
        )::BIGINT AS pending_count,
        (
            COUNT(e.id) FILTER (
                WHERE e.status = 'confirmed'
                  AND (e.confirmed_date = fd.course_date OR (e.confirmed_date IS NULL AND e.invited_date = fd.course_date))
            ) +
            COUNT(e.id) FILTER (
                WHERE e.status = 'invited'
                  AND e.invited_date = fd.course_date
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
