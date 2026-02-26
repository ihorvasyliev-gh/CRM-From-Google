-- 1. Drop existing unique constraint to allow data manipulation
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_first_last_email_key;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_email_key;

-- 2. Normalize existing data to ensure consistent INITCAP(trim()) for all
UPDATE students SET 
  first_name = INITCAP(TRIM(first_name)),
  last_name = INITCAP(TRIM(last_name)),
  email = LOWER(TRIM(email))
WHERE first_name IS NOT NULL;

-- 3. Deduplicate (merge students with the exact same name and email that manifested after normalization)
DO $$
DECLARE
  rec RECORD;
  dup RECORD;
  primary_id uuid;
BEGIN
  -- Find duplicates based on EXACT normalized values
  FOR rec IN (
    SELECT first_name, last_name, email, COUNT(*)
    FROM students
    GROUP BY first_name, last_name, email
    HAVING COUNT(*) > 1
  ) LOOP
    -- Pick the oldest created student as the primary
    SELECT id INTO primary_id
    FROM students 
    WHERE first_name = rec.first_name AND last_name = rec.last_name AND email = rec.email
    ORDER BY created_at ASC
    LIMIT 1;

    -- For each duplicate, transfer enrollments and delete the duplicate
    FOR dup IN (
      SELECT id FROM students
      WHERE first_name = rec.first_name AND last_name = rec.last_name AND email = rec.email AND id != primary_id
    ) LOOP
      
      -- Update enrollments: on conflict means the primary student is already enrolled in this course variant
      BEGIN
        UPDATE enrollments SET student_id = primary_id WHERE student_id = dup.id;
      EXCEPTION WHEN unique_violation THEN
        -- If primary already has this enrollment, just delete the duplicate's enrollment
        DELETE FROM enrollments WHERE student_id = dup.id;
      END;

      -- Delete the duplicate student
      DELETE FROM students WHERE id = dup.id;

    END LOOP;
  END LOOP;
END $$;

-- 4. Restore the strict UI constraint
ALTER TABLE students ADD CONSTRAINT students_first_last_email_key UNIQUE(first_name, last_name, email);

-- 5. Create a Trigger to enforce capitalization BEFORE checking constraints
-- This ensures that if the Google Script sends "israel", the DB automatically changes it to "Israel"
-- BEFORE checking the unique ID, resulting in a clean "merge-duplicates" instead of a new duplicate!
CREATE OR REPLACE FUNCTION trg_students_normalize_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.first_name IS NOT NULL THEN
    NEW.first_name := INITCAP(TRIM(NEW.first_name));
  END IF;
  IF NEW.last_name IS NOT NULL THEN
    NEW.last_name := INITCAP(TRIM(NEW.last_name));
  END IF;
  IF NEW.email IS NOT NULL THEN
    NEW.email := LOWER(TRIM(NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_students ON students;

CREATE TRIGGER trg_normalize_students
BEFORE INSERT OR UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION trg_students_normalize_fn();
