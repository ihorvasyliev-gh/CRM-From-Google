-- ============================================================
-- Migration 97: Course completion dates on Outcomes
--
-- Adds each graduate's course completion date(s) to
-- get_outcome_graduates() so the Outcomes page can display,
-- sort and filter graduates by when they completed a course
-- (recently, a while ago, or in a custom date range).
--
--   last_completed_date     Most recent completion day (DATE)
--                           across the student's completed courses.
--   course_completed_dates  JSONB map { course_name: "YYYY-MM-DD" }
--                           so filtering by a specific course uses
--                           that course's own completion date.
--
-- Each completed enrollment uses completed_date when present,
-- falling back to confirmed_date, completed_at (Irish local day),
-- invited_date, or created_at for legacy rows.
--
-- Until this migration runs, the Outcomes page still works by
-- falling back to building the graduate list in the browser.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_outcome_graduates();

CREATE FUNCTION public.get_outcome_graduates()
RETURNS TABLE (
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    courses TEXT[],
    is_working BOOLEAN,
    started_month TEXT,
    field_of_work TEXT,
    employment_type TEXT,
    status_updated_at TIMESTAMPTZ,
    tracking_status TEXT,
    last_sent_at TIMESTAMPTZ,
    called_no_answer_at TIMESTAMPTZ,
    last_completed_date DATE,
    course_completed_dates JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH completed AS (
        SELECT
            e.student_id,
            COALESCE(c.name, 'Unknown') AS course_name,
            MAX(COALESCE(
                e.completed_date,
                e.confirmed_date,
                (e.completed_at AT TIME ZONE 'Europe/Dublin')::date,
                e.invited_date,
                (e.created_at AT TIME ZONE 'Europe/Dublin')::date
            )) AS completed_date
        FROM public.enrollments e
        LEFT JOIN public.courses c ON c.id = e.course_id
        WHERE e.status = 'completed'
        GROUP BY e.student_id, COALESCE(c.name, 'Unknown')
    )
    SELECT
        s.id,
        COALESCE(s.first_name, ''),
        COALESCE(s.last_name, ''),
        COALESCE(s.email, ''),
        NULLIF(TRIM(s.phone), ''),
        array_agg(comp.course_name ORDER BY comp.course_name),
        es.is_working,
        es.started_month,
        es.field_of_work,
        es.employment_type,
        es.last_responded_at,
        CASE WHEN es.id IS NULL THEN 'not_contacted' ELSE es.status END,
        es.last_invited_at,
        es.called_no_answer_at,
        MAX(comp.completed_date),
        jsonb_object_agg(comp.course_name, comp.completed_date)
    FROM completed comp
    JOIN public.students s ON s.id = comp.student_id
    LEFT JOIN public.employment_status es ON es.student_id = s.id
    GROUP BY s.id, es.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_outcome_graduates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_outcome_graduates() TO authenticated;

COMMIT;

-- PostgREST picks up the updated function return columns
NOTIFY pgrst, 'reload schema';
