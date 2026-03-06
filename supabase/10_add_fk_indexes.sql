-- ============================================================
-- 10_add_fk_indexes.sql
-- 1. Adds B-tree indexes for foreign keys in the enrollments table
--    This prevents Sequential Scans and significantly speeds up
--    JOIN operations and ON DELETE CASCADE filtering.
-- ============================================================

-- Create index on student_id to speed up fetching a student's enrollments
-- and to speed up cascading deletes from students table.
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);

-- Create index on course_id to speed up fetching a course's enrollments
-- and to speed up cascading deletes from courses table.
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);
