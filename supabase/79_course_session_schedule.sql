-- ============================================================
-- Migration 79: Time, place and days of a course date
--
-- A course date (invite_dates row: course + first day) can now carry
-- its schedule, entered once in the invite dialog and reused for every
-- later invitation, reminder and the confirmation page:
--
--   start_time / end_time  default time of every day (NULL = not set)
--   location               where the course takes place
--   days                   every day of a course that runs over several
--                          days, the first day included:
--                          [{"date":"2026-10-01"},
--                           {"date":"2026-10-08","start":"10:00","end":"12:00"}]
--                          "start"/"end" only where a day differs from
--                          the default time. NULL = a one-day course.
--
-- Enrollments still point at the first day (invited_date /
-- confirmed_date), so capacity, reminders and documents keep working
-- per course date as before.
--
-- get_confirmation_sessions(token): the schedule of the date(s) a
-- confirmation link offers, for the public /c/:token page.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

ALTER TABLE public.invite_dates
    ADD COLUMN IF NOT EXISTS start_time TIME,
    ADD COLUMN IF NOT EXISTS end_time   TIME,
    ADD COLUMN IF NOT EXISTS location   TEXT,
    ADD COLUMN IF NOT EXISTS days       JSONB;

ALTER TABLE public.invite_dates DROP CONSTRAINT IF EXISTS invite_dates_days_is_array;
ALTER TABLE public.invite_dates
    ADD CONSTRAINT invite_dates_days_is_array CHECK (days IS NULL OR jsonb_typeof(days) = 'array');

ALTER TABLE public.invite_dates DROP CONSTRAINT IF EXISTS invite_dates_location_length;
ALTER TABLE public.invite_dates
    ADD CONSTRAINT invite_dates_location_length CHECK (location IS NULL OR char_length(location) <= 500);

COMMENT ON COLUMN public.invite_dates.start_time IS 'Default start time of every day of this course date (NULL = not set).';
COMMENT ON COLUMN public.invite_dates.end_time   IS 'Default end time of every day of this course date (NULL = not set).';
COMMENT ON COLUMN public.invite_dates.location   IS 'Where this course date takes place.';
COMMENT ON COLUMN public.invite_dates.days       IS 'Every day of a multi-day course, first day included: [{date, start?, end?}]. NULL = one day.';

-- ------------------------------------------------------------
-- Public: schedule of the dates a confirmation link offers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_confirmation_sessions(p_token TEXT)
RETURNS TABLE(course_date DATE, start_time TEXT, end_time TEXT, location TEXT, days JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT i.invite_date,
           to_char(i.start_time, 'HH24:MI'),
           to_char(i.end_time, 'HH24:MI'),
           i.location,
           i.days
    FROM confirmation_tokens ct
    CROSS JOIN LATERAL unnest(COALESCE(ct.course_dates, ARRAY[ct.course_date])) AS offered(d)
    JOIN invite_dates i ON i.course_id = ct.course_id AND i.invite_date = offered.d
    WHERE ct.token = p_token
      AND ct.expires_at > now()
    ORDER BY i.invite_date;
$$;

REVOKE EXECUTE ON FUNCTION public.get_confirmation_sessions(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_confirmation_sessions(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
