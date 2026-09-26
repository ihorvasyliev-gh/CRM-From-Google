-- ============================================================
-- Migration 73: Document generation hardening
--
-- 1. The templates bucket becomes private. Templates can hold
--    signatures and partner logos, and file paths are guessable
--    (template_<timestamp>.docx). The app now downloads them
--    through the signed-in session, so only admins can read them.
-- 2. document_settings: one shared row for the columns of
--    Participants.xlsx (previously each admin's own browser copy).
-- 3. Deleting a document template also drops it from every
--    course's template preset (courses.template_ids).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Private templates bucket, readable by admins only
-- ------------------------------------------------------------
-- The SQL Editor's postgres role may not own storage.objects, nor be allowed to
-- SET ROLE supabase_storage_admin (newer projects refuse it). Each step is tried
-- here and, if refused, skipped with a NOTICE saying what to do in the dashboard
-- instead; the rest of the migration still runs. The app works either way: it
-- downloads templates through the signed-in session.
DO $$
BEGIN
    -- Drop + create together: if the create is refused, the drop is undone too
    DROP POLICY IF EXISTS "Allow authenticated users to view templates" ON storage.objects;
    CREATE POLICY "Allow authenticated users to view templates" ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'templates'
            AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> ALL (ARRAY['viewer'::text, 'outreach'::text])
        );
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped: not allowed to change policies on storage.objects. In Storage -> Policies, edit "Allow authenticated users to view templates" (templates bucket, SELECT) so viewers and outreach users cannot read templates.';
END $$;

DO $$
BEGIN
    -- Only go private while signed-in reads are allowed, or template downloads would fail
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'Allow authenticated users to view templates'
    ) THEN
        RAISE NOTICE 'Skipped: the templates bucket stays public, because storage.objects has no "Allow authenticated users to view templates" SELECT policy. Add one for the templates bucket in Storage -> Policies, then make the bucket private in Storage -> templates -> Edit bucket.';
        RETURN;
    END IF;
    UPDATE storage.buckets SET public = false WHERE id = 'templates';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped: not allowed to update storage.buckets. Make the bucket private in Storage -> templates -> Edit bucket (turn off "Public bucket").';
END $$;

-- ------------------------------------------------------------
-- 2. Shared document settings (a single row, id = true)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_settings (
    id            BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    -- [{ "header": "First Name", "placeholder": "firstName" }, …]; NULL = not set yet
    excel_columns JSONB,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage document settings" ON public.document_settings;
CREATE POLICY "Admins manage document settings" ON public.document_settings
    FOR ALL USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

INSERT INTO public.document_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Keep course presets free of deleted templates
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_template_from_course_presets()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.courses
       SET template_ids = array_remove(template_ids, OLD.id)
     WHERE OLD.id = ANY (template_ids);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.remove_template_from_course_presets() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_remove_template_from_course_presets ON public.document_templates;
CREATE TRIGGER trg_remove_template_from_course_presets
    AFTER DELETE ON public.document_templates
    FOR EACH ROW EXECUTE FUNCTION public.remove_template_from_course_presets();

-- Presets may already point at templates deleted before this migration
UPDATE public.courses c
   SET template_ids = ARRAY(
        SELECT t FROM unnest(c.template_ids) AS t
         WHERE EXISTS (SELECT 1 FROM public.document_templates d WHERE d.id = t)
   )
 WHERE EXISTS (
        SELECT 1 FROM unnest(c.template_ids) AS t
         WHERE NOT EXISTS (SELECT 1 FROM public.document_templates d WHERE d.id = t)
   );
