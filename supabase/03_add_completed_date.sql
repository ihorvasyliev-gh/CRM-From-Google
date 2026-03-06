-- Add completed_date column to enrollments table
-- This tracks when an enrollment was marked as completed
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS completed_date date;
