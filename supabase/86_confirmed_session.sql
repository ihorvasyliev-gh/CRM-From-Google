-- ============================================================
-- Migration 86: Confirmation page shows the date a person is confirmed for
--
-- After confirming, or checking their place on a fully booked date,
-- the /c/:token page shows the course date with its time and place.
-- It used to take them from the link, which is wrong when the
-- organizer confirmed the person for another date, and has no date
-- at all for a link offering several dates.
--
--   get_confirmed_session(email, course_id, student_id)
--       The course date the email is confirmed for on this course
--       (the nearest upcoming one, else the latest), with the time,
--       place and days of that date when they are set (migration 79).
--       No row: nothing confirmed for that email.
--
-- Public like public_confirm_enrollment, which already tells anyone
-- with the course id whether an email is confirmed.
--
-- Until this migration runs the page still works: it shows the date
-- from the link, as before.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_confirmed_session(
    p_email TEXT,
    p_course_id UUID,
    p_student_id UUID DEFAULT NULL
)
RETURNS TABLE(course_date DATE, start_time TEXT, end_time TEXT, location TEXT, days JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT c.course_date,
           to_char(i.start_time, 'HH24:MI'),
           to_char(i.end_time, 'HH24:MI'),
           i.location,
           i.days
    FROM (
        -- Older rows only have the invited date
        SELECT COALESCE(e.confirmed_date, e.invited_date) AS course_date
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.course_id = p_course_id
          AND e.status = 'confirmed'
          AND lower(trim(s.email)) = lower(trim(p_email))
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
          AND COALESCE(e.confirmed_date, e.invited_date) IS NOT NULL
        ORDER BY COALESCE(e.confirmed_date, e.invited_date) >= CURRENT_DATE DESC,
                 CASE WHEN COALESCE(e.confirmed_date, e.invited_date) >= CURRENT_DATE
                      THEN COALESCE(e.confirmed_date, e.invited_date) END ASC,
                 COALESCE(e.confirmed_date, e.invited_date) DESC
        LIMIT 1
    ) c
    LEFT JOIN invite_dates i ON i.course_id = p_course_id AND i.invite_date = c.course_date;
$$;

REVOKE EXECUTE ON FUNCTION public.get_confirmed_session(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_confirmed_session(TEXT, UUID, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
