-- ============================================================
-- Migration 68: Per-course text for invitation / reminder emails
--
-- courses.email_templates holds the course's own rich text shown in
-- the email course card: { description (under the course title),
-- details (under the date: duration, time, address...) }.
-- ============================================================
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS email_templates jsonb NOT NULL DEFAULT '{}'::jsonb;
