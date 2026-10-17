-- ============================================================
-- Migration 84: Students and courses record when they last changed
--
-- After a dropped connection (or a laptop waking up) the app used to
-- download every enrollment again, with its student and course, to be
-- sure it had not missed a change. It now reads only what changed
-- since it last looked: enrollments by their updated_at, and students
-- and courses (whose names and details each enrollment shows) by the
-- updated_at column this migration adds to them.
--
--   students.updated_at, courses.updated_at
--       Set on every change by the same trigger function as
--       enrollments.updated_at. Rows that exist already start at the
--       time this migration runs.
--
-- Also indexes enrollments.updated_at, which the app now filters on.
--
-- Until this migration runs the app still works: it reloads every
-- enrollment after a gap, as before.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_students_updated_at ON public.students;
CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON public.courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_enrollments_updated_at
    ON public.enrollments(updated_at);
