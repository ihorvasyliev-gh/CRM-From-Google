-- ============================================================
-- Migration 75: PDF Forms (fill flat PDF forms from spreadsheets)
--
-- A template is a PDF (e.g. the SICAP registration forms) plus
-- the list of fields saying which spreadsheet column goes where.
-- The spreadsheet itself never reaches the database: forms are
-- filled in the browser.
--
-- 1. New role 'forms' ("PDF Forms"): sees the PDF Forms page only.
--    is_app_admin() and every admin-only policy exclude it, the
--    same way migration 65 did for 'outreach'.
-- 2. can_manage_pdf_forms(): admins and forms users (they create
--    templates and upload new PDF revisions). Viewers and outreach
--    users fill forms from the saved templates.
-- 3. Table pdf_form_templates: every signed-in role reads,
--    admins + forms users write.
-- 4. Private storage bucket "pdf-forms" with the same rule.
-- 5. External Lists stay closed to forms users.
-- 6. API allowlist (PostgREST pre-request hook from migration 65):
--    outreach users may also reach pdf_form_templates; forms users
--    only pdf_form_templates and their own user_settings.
-- 7. set_user_role() accepts 'forms'.
--
-- Role changes reach the user's JWT on the next token refresh
-- (at most ~1 hour, or on re-login).
-- NOTE: variables are assigned with ":=" on purpose (see migration 57).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Role helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated'
       AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('viewer', 'outreach', 'forms');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- Only reads the caller's JWT, so no SECURITY DEFINER. Callable by anon
-- (returns false) because RLS policies use it.
CREATE OR REPLACE FUNCTION public.can_manage_pdf_forms()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated'
       AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('viewer', 'outreach');
$$ LANGUAGE sql STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_manage_pdf_forms() TO anon, authenticated;

-- External Lists (migration 69: every signed-in user) — but not forms users
CREATE OR REPLACE FUNCTION public.can_manage_outreach()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated'
       AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'forms';
$$ LANGUAGE sql STABLE SET search_path = public;

-- ------------------------------------------------------------
-- 2. Every admin-only policy ("not viewer, not outreach") now
--    also excludes 'forms' (tables in public + storage buckets).
-- ------------------------------------------------------------
DO $$
DECLARE
    r       RECORD;
    v_old   TEXT := '<> ALL (ARRAY[''viewer''::text, ''outreach''::text])';
    v_new   TEXT := '<> ALL (ARRAY[''viewer''::text, ''outreach''::text, ''forms''::text])';
    v_sql   TEXT;
    v_count INT := 0;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname IN ('public', 'storage')
          AND (strpos(coalesce(qual, ''), v_old) > 0 OR strpos(coalesce(with_check, ''), v_old) > 0)
    LOOP
        v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        IF r.qual IS NOT NULL THEN
            v_sql := v_sql || ' USING (' || replace(r.qual, v_old, v_new) || ')';
        END IF;
        IF r.with_check IS NOT NULL THEN
            v_sql := v_sql || ' WITH CHECK (' || replace(r.with_check, v_old, v_new) || ')';
        END IF;

        BEGIN
            EXECUTE v_sql;
            v_count := v_count + 1;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE WARNING 'Could not update policy "%" on %.% — edit it by hand so it also excludes the forms role.',
                r.policyname, r.schemaname, r.tablename;
        END;
    END LOOP;

    RAISE NOTICE 'Updated % policies to exclude the forms role', v_count;

    -- Fail closed: no table in public may still treat forms users as admins
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND (strpos(coalesce(qual, ''), v_old) > 0 OR strpos(coalesce(with_check, ''), v_old) > 0)
    ) THEN
        RAISE EXCEPTION 'Migration stopped: some policies in public still let forms users act as admins.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND (strpos(coalesce(qual, ''), '<> ''viewer''::text') > 0 OR strpos(coalesce(with_check, ''), '<> ''viewer''::text') > 0)
    ) THEN
        RAISE EXCEPTION 'Migration stopped: some policies in public only exclude viewers. Apply migration 65 first.';
    END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Templates table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pdf_form_templates (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description    TEXT,
    -- Object path in the "pdf-forms" bucket
    pdf_path       TEXT NOT NULL,
    -- File name as uploaded, shown to people
    pdf_name       TEXT NOT NULL,
    -- Bumped each time a new revision of the PDF replaces the old one
    revision       INT NOT NULL DEFAULT 1,
    -- [{ id, kind: 'text' | 'choice', name, source, rect | options, … }]
    fields         JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
    -- { "Header in template": ["Header in another spreadsheet", …] }
    column_aliases JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(column_aliases) = 'object'),
    -- { mark: 'tick' | 'cross', fileName: '{Name of Group}' }
    settings       JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
    created_by     UUID DEFAULT auth.uid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_pdf_form_template()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.touch_pdf_form_template() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_pdf_form_template ON public.pdf_form_templates;
CREATE TRIGGER trg_touch_pdf_form_template
    BEFORE UPDATE ON public.pdf_form_templates
    FOR EACH ROW EXECUTE FUNCTION public.touch_pdf_form_template();

ALTER TABLE public.pdf_form_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users read PDF form templates" ON public.pdf_form_templates;
CREATE POLICY "Signed-in users read PDF form templates" ON public.pdf_form_templates
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Form managers insert PDF form templates" ON public.pdf_form_templates;
CREATE POLICY "Form managers insert PDF form templates" ON public.pdf_form_templates
    FOR INSERT WITH CHECK (public.can_manage_pdf_forms());

DROP POLICY IF EXISTS "Form managers update PDF form templates" ON public.pdf_form_templates;
CREATE POLICY "Form managers update PDF form templates" ON public.pdf_form_templates
    FOR UPDATE USING (public.can_manage_pdf_forms()) WITH CHECK (public.can_manage_pdf_forms());

DROP POLICY IF EXISTS "Form managers delete PDF form templates" ON public.pdf_form_templates;
CREATE POLICY "Form managers delete PDF form templates" ON public.pdf_form_templates
    FOR DELETE USING (public.can_manage_pdf_forms());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_form_templates TO authenticated;

-- ------------------------------------------------------------
-- 4. Private "pdf-forms" bucket
--    As in migration 73, each storage step is tried and, if the
--    SQL Editor's role may not change storage, skipped with a
--    NOTICE saying what to set up in the dashboard instead.
-- ------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('pdf-forms', 'pdf-forms', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped: not allowed to create buckets. In Storage, create a PRIVATE bucket named "pdf-forms".';
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS "PDF forms: signed-in users read" ON storage.objects;
    CREATE POLICY "PDF forms: signed-in users read" ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'pdf-forms');

    DROP POLICY IF EXISTS "PDF forms: managers upload" ON storage.objects;
    CREATE POLICY "PDF forms: managers upload" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'pdf-forms' AND public.can_manage_pdf_forms());

    DROP POLICY IF EXISTS "PDF forms: managers update" ON storage.objects;
    CREATE POLICY "PDF forms: managers update" ON storage.objects
        FOR UPDATE TO authenticated
        USING (bucket_id = 'pdf-forms' AND public.can_manage_pdf_forms())
        WITH CHECK (bucket_id = 'pdf-forms' AND public.can_manage_pdf_forms());

    DROP POLICY IF EXISTS "PDF forms: managers delete" ON storage.objects;
    CREATE POLICY "PDF forms: managers delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'pdf-forms' AND public.can_manage_pdf_forms());
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped: not allowed to change policies on storage.objects. In Storage -> Policies, add for bucket "pdf-forms": SELECT for authenticated users; INSERT, UPDATE and DELETE where public.can_manage_pdf_forms().';
END $$;

-- ------------------------------------------------------------
-- 5. API allowlist for the restricted roles
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restrict_outreach_api_requests()
RETURNS VOID AS $$
DECLARE
    v_role   TEXT;
    v_path   TEXT;
    v_method TEXT;
BEGIN
    v_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
    IF v_role NOT IN ('outreach', 'forms') THEN
        RETURN;
    END IF;

    v_path   := COALESCE(current_setting('request.path', true), '');
    v_method := upper(COALESCE(current_setting('request.method', true), ''));

    IF v_path ~ '^/(pdf_form_templates|user_settings)/?$' THEN
        RETURN;
    END IF;

    IF v_role = 'outreach' AND (
        v_path ~ '^/(outreach_lists|outreach_contacts|outreach_contacts_view)/?$'
        OR v_path ~ '^/rpc/(import_outreach_contacts|mark_outreach_contacts_pending)/?$'
        OR (v_path ~ '^/email_opt_outs/?$' AND v_method IN ('GET', 'HEAD'))
    ) THEN
        RETURN;
    END IF;

    IF v_role = 'forms' THEN
        RAISE EXCEPTION 'Your account only has access to PDF Forms' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Your account only has access to External Lists and PDF Forms' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.restrict_outreach_api_requests() TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload config';

-- ------------------------------------------------------------
-- 6. Role management (admins only): viewer / outreach / forms,
--    or promote to admin. Admins still can't be changed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID AS $$
DECLARE
    v_current TEXT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can change roles' USING ERRCODE = '42501';
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('viewer', 'outreach', 'forms', 'admin') THEN
        RAISE EXCEPTION 'Unknown role: %', p_role USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
        RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
    END IF;

    -- A missing role has always meant admin (see migration 58)
    v_current := COALESCE(NULLIF((SELECT u.raw_app_meta_data ->> 'role' FROM auth.users u WHERE u.id = p_user_id), ''), 'admin');

    IF v_current NOT IN ('viewer', 'outreach', 'forms') THEN
        RAISE EXCEPTION 'Admins can''t be changed to another role' USING ERRCODE = '22023';
    END IF;

    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role),
        updated_at = now()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;
