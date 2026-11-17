-- ============================================================
-- Migration 91: SICAP course form template
--
-- Documents → "SICAP course form": one Word template, replaced by
-- uploading a new one, like the attendance sheet. Generating documents
-- adds one filled-in form per course date: page 1 from the course
-- (name + last day, start and end date, place, staff member), page 2
-- with the participants' names, nine per page.
--
-- The file goes to the existing "templates" storage bucket, so only
-- this table is new. Viewers can't read or change it, as with the
-- other document templates (migration 29).
--
-- Until this runs, the Documents page works as before and the SICAP
-- card says to run it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sicap_templates (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sicap_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated access" ON public.sicap_templates;
CREATE POLICY "Authenticated access" ON public.sicap_templates
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- PostgREST picks up the new table straight away
NOTIFY pgrst, 'reload schema';
