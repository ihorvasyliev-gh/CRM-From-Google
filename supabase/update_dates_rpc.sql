-- SQL Script to create the RPC function for bulk updating registration dates
-- You can run this in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION bulk_update_registration_dates(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  elem jsonb;
BEGIN
  -- Loop through each item in the JSON array
  FOR elem IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    -- 1. Update the enrollment's created_at timestamp
    UPDATE enrollments
    SET created_at = (elem->>'created_at')::timestamptz
    WHERE student_id = (elem->>'student_id')::uuid
      AND course_id = (elem->>'course_id')::uuid
      AND course_variant = elem->>'course_variant';
      
    -- 2. Update the student's created_at timestamp to be the oldest possible registration date
    -- LEAST() ensures we only move the date further back in time, never forward.
    UPDATE students
    SET created_at = LEAST(created_at, (elem->>'created_at')::timestamptz)
    WHERE id = (elem->>'student_id')::uuid;
  END LOOP;
END;
$$;
