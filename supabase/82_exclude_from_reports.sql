-- ============================================================
-- Migration 82: Course runs left out of reports
--
-- A course run (course + language + course date) can be marked
-- "Ignore in reports" in Analytics → Courses & cohorts, e.g. people
-- sent to a course run by another part of the organisation and marked
-- completed only to make their certificates. Its enrollments then
-- count nowhere in Analytics or the one-page report: not as
-- registrations, completions or course runs. They stay on the board,
-- in Students and in Documents as before.
--
--   exclude_from_reports   TRUE = left out of Analytics and reports.
--                          NULL counts as FALSE (rows restored by Undo
--                          from before this migration carry NULL).
--
-- Admins set it from the app like the other enrollment fields (RLS
-- unchanged).
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

ALTER TABLE public.enrollments
    ADD COLUMN IF NOT EXISTS exclude_from_reports BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.enrollments.exclude_from_reports IS
    'Left out of Analytics and the one-page report (a course run marked "Ignore in reports"). NULL = counted.';
