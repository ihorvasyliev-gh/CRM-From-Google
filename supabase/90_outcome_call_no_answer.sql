-- ============================================================
-- Migration 90: "Called, no answer" mark on Outcomes
--
-- When the survey email gets no reply, the team phones people.
-- A row can now be marked "called, didn't pick up" without
-- changing its tracking status (it stays Pending or Not
-- Contacted), so whoever goes on with the calls sees who was
-- already tried and when.
--
-- 1. Column called_no_answer_at on employment_status (CRM
--    graduates) and outreach_contacts (External Lists).
--    NULL = not marked; a time = when it was marked.
-- 2. outreach_contacts_view is made again so it has the column.
-- 3. get_outcome_graduates() also returns the mark and the
--    student's phone number.
--
-- Run it once in the Supabase SQL editor. Until it runs, the
-- Outcomes page works as before and says to run it when someone
-- tries to mark a call.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------
ALTER TABLE public.employment_status
    ADD COLUMN IF NOT EXISTS called_no_answer_at TIMESTAMPTZ;

ALTER TABLE public.outreach_contacts
    ADD COLUMN IF NOT EXISTS called_no_answer_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 2. View (c.* is fixed when a view is made, so it is made again;
--    same definition as migration 65)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.outreach_contacts_view;

CREATE VIEW public.outreach_contacts_view
WITH (security_invoker = on) AS
SELECT
    c.*,
    public.outreach_email_in_crm(c.email) AS in_crm
FROM public.outreach_contacts c;

GRANT SELECT ON public.outreach_contacts_view TO authenticated;

-- ------------------------------------------------------------
-- 3. Graduate list (migration 85) with phone and the call mark.
--    The returned columns change, so the function is dropped first.
-- ------------------------------------------------------------
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
    called_no_answer_at TIMESTAMPTZ
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
        NULLIF(TRIM(s.phone), ''),
        array_agg(DISTINCT COALESCE(c.name, 'Unknown') ORDER BY COALESCE(c.name, 'Unknown')),
        es.is_working,
        es.started_month,
        es.field_of_work,
        es.employment_type,
        es.last_responded_at,
        CASE WHEN es.id IS NULL THEN 'not_contacted' ELSE es.status END,
        es.last_invited_at,
        es.called_no_answer_at
    FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    LEFT JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.employment_status es ON es.student_id = s.id
    WHERE e.status = 'completed'
    GROUP BY s.id, es.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_outcome_graduates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_outcome_graduates() TO authenticated;

COMMIT;

-- PostgREST picks up the new columns and function
NOTIFY pgrst, 'reload schema';
