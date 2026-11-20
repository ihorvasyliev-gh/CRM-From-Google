-- ============================================================
-- Migration 93: Documents section redesign & hardening
--
-- 1. Fix sicap_templates RLS policy (use public.is_app_admin(),
--    matching document_settings & excluding viewer/outreach/forms)
--    and tighten anon grants on sicap_templates & document_settings.
-- 2. Upgrade document_templates with display_name, description,
--    sort_order, tags (extracted {placeholders}), and size_bytes,
--    backfilling sort_order from existing created_at order.
-- 3. Add tags, size_bytes and singleton guard to single-template
--    tables (attendance_templates, label_templates, sicap_templates)
--    so concurrent uploads can never leave hidden duplicate rows.
-- 4. Add updated_at triggers across Documents tables (and add
--    updated_at column to template_variables).
-- 5. Add public.document_generations (lightweight audit log /
--    "Recent runs" + "Generated X ago" indicator per course date).
-- 6. Publish Documents tables to supabase_realtime so multi-admin
--    edits sync automatically.
--
-- Until this runs, the Documents UI gracefully falls back to the
-- existing columns and hides generation history.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tighten RLS & grants on sicap_templates & document_settings
-- ------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.sicap_templates') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Authenticated access" ON public.sicap_templates;
        DROP POLICY IF EXISTS "Admins manage sicap templates" ON public.sicap_templates;
        CREATE POLICY "Admins manage sicap templates" ON public.sicap_templates
            FOR ALL TO authenticated
            USING (public.is_app_admin())
            WITH CHECK (public.is_app_admin());

        REVOKE ALL ON public.sicap_templates FROM anon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.sicap_templates TO authenticated;
    END IF;

    IF to_regclass('public.document_settings') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Admins manage document settings" ON public.document_settings;
        CREATE POLICY "Admins manage document settings" ON public.document_settings
            FOR ALL TO authenticated
            USING (public.is_app_admin())
            WITH CHECK (public.is_app_admin());

        REVOKE ALL ON public.document_settings FROM anon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_settings TO authenticated;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Upgrade document_templates metadata & sort_order
-- ------------------------------------------------------------
ALTER TABLE public.document_templates
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS description  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sort_order   INTEGER,
    ADD COLUMN IF NOT EXISTS tags         TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS size_bytes   INTEGER;

-- Backfill sort_order from existing created_at order (only for rows that don't have it yet)
WITH ranked AS (
    SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1)::INTEGER AS pos
    FROM public.document_templates
)
UPDATE public.document_templates t
   SET sort_order = r.pos
  FROM ranked r
 WHERE t.id = r.id
   AND t.sort_order IS NULL;

ALTER TABLE public.document_templates
    ALTER COLUMN sort_order SET DEFAULT 0,
    ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_templates_order
    ON public.document_templates (sort_order, created_at);

-- ------------------------------------------------------------
-- 3. Metadata & singleton guard on single-template tables
-- ------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
    chk_name TEXT;
    uniq_name TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['attendance_templates', 'label_templates', 'sicap_templates'] LOOP
        IF to_regclass('public.' || tbl) IS NULL THEN
            CONTINUE;
        END IF;

        -- Keep only the newest row if duplicate rows existed from concurrent uploads
        EXECUTE format(
            'DELETE FROM public.%I
              WHERE id NOT IN (
                  SELECT id FROM public.%I
                  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                  LIMIT 1
              )',
            tbl, tbl
        );

        EXECUTE format(
            'ALTER TABLE public.%I
                ADD COLUMN IF NOT EXISTS tags       TEXT[] NOT NULL DEFAULT ''{}'',
                ADD COLUMN IF NOT EXISTS size_bytes INTEGER,
                ADD COLUMN IF NOT EXISTS singleton  BOOLEAN NOT NULL DEFAULT true',
            tbl
        );

        chk_name := tbl || '_singleton_check';
        uniq_name := tbl || '_singleton_key';

        BEGIN
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (singleton)', tbl, chk_name);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;

        BEGIN
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (singleton)', tbl, uniq_name);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. updated_at triggers across Documents tables
-- ------------------------------------------------------------
ALTER TABLE public.template_variables
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.touch_documents_updated_at() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'document_templates',
        'attendance_templates',
        'label_templates',
        'sicap_templates',
        'template_variables',
        'document_settings'
    ] LOOP
        IF to_regclass('public.' || tbl) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON public.%I', tbl, tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_touch_%I
                BEFORE UPDATE ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.touch_documents_updated_at()',
            tbl, tbl
        );
    END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5. Generation history (Recent runs + "Generated X ago")
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_generations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID DEFAULT auth.uid(),
    staff_name        TEXT NOT NULL DEFAULT '',
    course_id         UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    course_name       TEXT NOT NULL DEFAULT '',
    session_date      TEXT,
    status            TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed', 'completed', 'mixed')),
    participant_count INTEGER NOT NULL DEFAULT 0 CHECK (participant_count >= 0),
    template_names    TEXT[] NOT NULL DEFAULT '{}',
    extras            TEXT[] NOT NULL DEFAULT '{}',
    file_name         TEXT NOT NULL DEFAULT '',
    total_docs        INTEGER NOT NULL DEFAULT 0 CHECK (total_docs >= 0),
    had_problems      BOOLEAN NOT NULL DEFAULT false,
    source            TEXT NOT NULL DEFAULT 'documents'
                      CHECK (source IN ('documents', 'board'))
);

CREATE INDEX IF NOT EXISTS idx_document_generations_recent
    ON public.document_generations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_generations_course_date
    ON public.document_generations (course_id, session_date, created_at DESC);

ALTER TABLE public.document_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage document generations" ON public.document_generations;
CREATE POLICY "Admins manage document generations" ON public.document_generations
    FOR ALL TO authenticated
    USING (public.is_app_admin())
    WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.document_generations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_generations TO authenticated;

-- ------------------------------------------------------------
-- 6. Realtime sync for multi-admin edits
-- ------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'document_templates',
        'attendance_templates',
        'label_templates',
        'sicap_templates',
        'template_variables',
        'document_settings',
        'document_generations'
    ] LOOP
        IF to_regclass('public.' || tbl) IS NULL THEN
            CONTINUE;
        END IF;
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        EXCEPTION WHEN duplicate_object OR undefined_object OR insufficient_privilege THEN
            NULL;
        END;
    END LOOP;
END $$;

-- PostgREST picks up new columns & tables immediately
NOTIFY pgrst, 'reload schema';
