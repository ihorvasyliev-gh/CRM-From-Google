-- Student Flags: mark students who didn't pass a course, with a comment.
-- Flags are student-level so they appear on ALL enrollment cards for that student.

CREATE TABLE IF NOT EXISTS student_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_flags_student ON student_flags(student_id);

-- Safe to re-run: schema.sql already creates this table and its policy on a fresh install,
-- and an existing policy (possibly tightened by a later migration) is never replaced.
ALTER TABLE student_flags ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_flags' AND policyname = 'Authenticated access') THEN
        CREATE POLICY "Authenticated access" ON student_flags
            FOR ALL USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;
