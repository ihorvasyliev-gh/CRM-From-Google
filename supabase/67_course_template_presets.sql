-- ============================================================
-- Migration 67: Per-course document template presets
--
-- courses.template_ids lists the document_templates used when
-- generating documents for the course. Empty = every active
-- template (previous behaviour).
-- ============================================================
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS template_ids uuid[] NOT NULL DEFAULT '{}';
