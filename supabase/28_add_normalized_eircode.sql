-- Migration 28: Add normalized_eircode generated column to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS normalized_eircode TEXT 
GENERATED ALWAYS AS (UPPER(REPLACE(eircode, ' ', ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_students_normalized_eircode ON public.students(normalized_eircode);
