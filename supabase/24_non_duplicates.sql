-- ============================================================
-- Migration 24: Student Non-Duplicates
-- Allows marking student profiles as separate individuals who happen to share email/phone contacts.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_non_duplicates (
    student_a_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
    student_b_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (student_a_id, student_b_id),
    CONSTRAINT check_student_order CHECK (student_a_id < student_b_id)
);

CREATE INDEX IF NOT EXISTS idx_student_non_duplicates_a ON student_non_duplicates(student_a_id);
CREATE INDEX IF NOT EXISTS idx_student_non_duplicates_b ON student_non_duplicates(student_b_id);

ALTER TABLE student_non_duplicates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'student_non_duplicates' AND policyname = 'Authenticated access'
    ) THEN
        CREATE POLICY "Authenticated access" ON student_non_duplicates
            FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;
