-- 1. Drop existing unique email constraint
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_email_key;

-- 2. Normalize existing emails to lowercase
UPDATE students SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL;

-- 3. Normalize existing phones
-- Keep digits only, then format
UPDATE students
SET phone = 
  CASE 
    WHEN regexp_replace(phone, '[^\d]', '', 'g') LIKE '353%' THEN '+' || regexp_replace(phone, '[^\d]', '', 'g')
    WHEN regexp_replace(phone, '[^\d]', '', 'g') LIKE '08%' THEN '+353' || substr(regexp_replace(phone, '[^\d]', '', 'g'), 2)
    WHEN regexp_replace(phone, '[^\d]', '', 'g') LIKE '8%' THEN '+353' || regexp_replace(phone, '[^\d]', '', 'g')
    ELSE phone
  END
WHERE phone IS NOT NULL AND phone != '';

-- 4. Deduplicate (merge students with the same name and email)
DO $$
DECLARE
  rec RECORD;
  dup RECORD;
  primary_id uuid;
BEGIN
  -- Loop through sets of identical (first_name, last_name, email) that have more than 1 record
  FOR rec IN (
    SELECT LOWER(TRIM(first_name)) as f, LOWER(TRIM(last_name)) as l, email, COUNT(*)
    FROM students
    GROUP BY LOWER(TRIM(first_name)), LOWER(TRIM(last_name)), email
    HAVING COUNT(*) > 1
  ) LOOP
    -- Pick the oldest created student as the primary
    SELECT id INTO primary_id
    FROM students 
    WHERE LOWER(TRIM(first_name)) = rec.f AND LOWER(TRIM(last_name)) = rec.l AND email = rec.email
    ORDER BY created_at ASC
    LIMIT 1;

    -- For each duplicate, transfer enrollments and delete the duplicate
    FOR dup IN (
      SELECT id FROM students
      WHERE LOWER(TRIM(first_name)) = rec.f AND LOWER(TRIM(last_name)) = rec.l AND email = rec.email AND id != primary_id
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

-- 5. Create new unique constraint allowing family members
-- We use a unique index so we can use case-insensitive constraints if needed, but a regular constraint is fine for Supabase's simple ON CONFLICT usage:
ALTER TABLE students ADD CONSTRAINT students_first_last_email_key UNIQUE(first_name, last_name, email);
