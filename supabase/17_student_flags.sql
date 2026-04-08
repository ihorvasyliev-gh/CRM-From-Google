-- Student Flags: mark students who didn't pass a course, with a comment.
-- Flags are student-level so they appear on ALL enrollment cards for that student.

CREATE TABLE student_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_student_flags_student ON student_flags(student_id);

ALTER TABLE student_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access" ON student_flags
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
