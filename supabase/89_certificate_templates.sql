-- ============================================================
-- Migration 89: Certificate templates for /certificates
--
-- Admins upload Word certificate templates in Settings →
-- Certificates. The public page /certificates (no sign-in) lists
-- the ones switched on, so whoever makes certificates picks one
-- instead of bringing the file. Each template can carry how long
-- the certificate is valid for (validity_months): the page then
-- works out the expiry date from the course date.
--
-- 1. Table certificate_templates: anyone (also signed out) reads
--    the templates that are on; admins read and change all.
-- 2. Private storage bucket "certificate-templates": the file of
--    a template that is on can be downloaded by anyone, the rest
--    by admins only; admins upload, replace and delete.
--
-- Until this migration runs, /certificates works as before (the
-- person chooses a Word file) and Settings says to run it.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certificate_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Shown on /certificates, e.g. "Manual Handling"
    name            TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    -- The uploaded file's own name, for the downloaded files
    file_name       TEXT NOT NULL,
    -- Object path in the "certificate-templates" bucket
    storage_path    TEXT NOT NULL UNIQUE,
    -- The {placeholders} found in the file, shown before it is opened
    tags            TEXT[] NOT NULL DEFAULT '{}',
    -- How long the certificate is valid for; NULL: no set length
    validity_months INT CHECK (validity_months BETWEEN 1 AND 600),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INT NOT NULL DEFAULT 0,
    size_bytes      INT,
    created_by      UUID DEFAULT auth.uid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificate_templates_order ON public.certificate_templates (sort_order, name);

CREATE OR REPLACE FUNCTION public.touch_certificate_template()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.touch_certificate_template() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_certificate_template ON public.certificate_templates;
CREATE TRIGGER trg_touch_certificate_template
    BEFORE UPDATE ON public.certificate_templates
    FOR EACH ROW EXECUTE FUNCTION public.touch_certificate_template();

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads certificate templates that are on" ON public.certificate_templates;
CREATE POLICY "Anyone reads certificate templates that are on" ON public.certificate_templates
    FOR SELECT TO anon, authenticated
    USING (is_active);

DROP POLICY IF EXISTS "Admins manage certificate templates" ON public.certificate_templates;
CREATE POLICY "Admins manage certificate templates" ON public.certificate_templates
    FOR ALL TO authenticated
    USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.certificate_templates FROM anon;
GRANT SELECT ON public.certificate_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificate_templates TO authenticated;

-- ------------------------------------------------------------
-- 2. Private "certificate-templates" bucket
--    As in migrations 73 and 75, each storage step is tried and,
--    if the SQL Editor's role may not change storage, skipped
--    with a NOTICE saying what to set up in the dashboard.
-- ------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('certificate-templates', 'certificate-templates', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped: not allowed to create buckets. In Storage, create a PRIVATE bucket named "certificate-templates".';
END $$;

DO $$
BEGIN
    -- The file of a template that is on: anyone, as /certificates needs no sign-in
    DROP POLICY IF EXISTS "Certificate templates: anyone reads those that are on" ON storage.objects;
    CREATE POLICY "Certificate templates: anyone reads those that are on" ON storage.objects
        FOR SELECT TO anon, authenticated
        USING (
            bucket_id = 'certificate-templates'
            AND EXISTS (
                SELECT 1 FROM public.certificate_templates t
                WHERE t.storage_path = storage.objects.name AND t.is_active
            )
        );

    DROP POLICY IF EXISTS "Certificate templates: admins read" ON storage.objects;
    CREATE POLICY "Certificate templates: admins read" ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'certificate-templates' AND public.is_app_admin());

    DROP POLICY IF EXISTS "Certificate templates: admins upload" ON storage.objects;
    CREATE POLICY "Certificate templates: admins upload" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'certificate-templates' AND public.is_app_admin());

    DROP POLICY IF EXISTS "Certificate templates: admins update" ON storage.objects;
    CREATE POLICY "Certificate templates: admins update" ON storage.objects
        FOR UPDATE TO authenticated
        USING (bucket_id = 'certificate-templates' AND public.is_app_admin())
        WITH CHECK (bucket_id = 'certificate-templates' AND public.is_app_admin());

    DROP POLICY IF EXISTS "Certificate templates: admins delete" ON storage.objects;
    CREATE POLICY "Certificate templates: admins delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'certificate-templates' AND public.is_app_admin());
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped: not allowed to change policies on storage.objects. In Storage -> Policies, add for bucket "certificate-templates": SELECT for anon and authenticated where the file is the storage_path of an active row in public.certificate_templates; SELECT, INSERT, UPDATE and DELETE where public.is_app_admin().';
END $$;
