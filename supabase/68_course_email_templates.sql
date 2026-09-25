-- ============================================================
-- Migration 68: Per-course invitation / reminder email wording
--
-- courses.email_templates overrides the global templates from
-- Settings for one course: { invite_subject, invite_body,
-- reminder_subject, reminder_body }. Missing/empty key = use the
-- global template.
-- ============================================================
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS email_templates jsonb NOT NULL DEFAULT '{}'::jsonb;
