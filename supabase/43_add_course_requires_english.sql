-- ============================================================
-- Migration 43: Add requires_english to courses table
-- ============================================================

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS requires_english BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN courses.requires_english IS 'Indicates whether the course requires high English proficiency and should use the High English invite template';
