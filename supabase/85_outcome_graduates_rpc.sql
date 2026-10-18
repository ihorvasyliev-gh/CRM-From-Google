-- ============================================================
-- Migration 85: Outcomes reads its graduate list in one request
--
-- The Outcomes page used to download every completed enrollment with
-- its student and course, and every employment status, then build the
-- list of graduates in the browser: about a dozen requests and 2 MB.
-- This function returns that list ready to show, one row per student
-- who completed at least one course:
--
--   get_outcome_graduates()
--       Student, the names of the courses completed, and the latest
--       employment answer and survey tracking (none yet: tracking
--       status 'not_contacted').
--
-- It runs with the caller's own access (SECURITY INVOKER), so the
-- usual row-level security decides what each user sees: admins see
-- every graduate, other roles nothing they couldn't read before.
--
-- Until this migration runs the app still works: it builds the list in
-- the browser, as before.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_outcome_graduates()
RETURNS TABLE (
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    courses TEXT[],
    is_working BOOLEAN,
    started_month TEXT,
    field_of_work TEXT,
    employment_type TEXT,
    status_updated_at TIMESTAMPTZ,
    tracking_status TEXT,
    last_sent_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        s.id,
        COALESCE(s.first_name, ''),
        COALESCE(s.last_name, ''),
        COALESCE(s.email, ''),
        array_agg(DISTINCT COALESCE(c.name, 'Unknown') ORDER BY COALESCE(c.name, 'Unknown')),
        es.is_working,
        es.started_month,
        es.field_of_work,
        es.employment_type,
        es.last_responded_at,
        CASE WHEN es.id IS NULL THEN 'not_contacted' ELSE es.status END,
        es.last_invited_at
    FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    LEFT JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.employment_status es ON es.student_id = s.id
    WHERE e.status = 'completed'
    GROUP BY s.id, es.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_outcome_graduates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_outcome_graduates() TO authenticated;
