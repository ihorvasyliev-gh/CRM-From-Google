-- ============================================================
-- Outcomes Tracking: Employment Status of Graduates
-- Shared link bulk invited flow
-- ============================================================

-- Drop old tables if re-running after refactor
DROP TABLE IF EXISTS status_tokens CASCADE;
DROP TABLE IF EXISTS employment_status CASCADE;

-- Table: employment_status
-- Stores the latest employment info for each student, as well as tracking status.
CREATE TABLE IF NOT EXISTS employment_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
    email TEXT,
    is_working BOOLEAN,
    started_month TEXT,          -- 'YYYY-MM' format
    field_of_work TEXT,
    employment_type TEXT,        -- 'full_time' or 'part_time'
    status TEXT DEFAULT 'pending', -- 'pending' or 'responded'
    last_invited_at TIMESTAMPTZ,
    last_responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employment_status_student ON employment_status(student_id);

ALTER TABLE employment_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage employment_status"
    ON employment_status FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- RPC: mark_students_outcomes_pending(p_student_ids UUID[])
-- Bulk updates a list of students to 'pending' status. 
-- Does not overwrite existing form data if they previously responded.
-- ============================================================
CREATE OR REPLACE FUNCTION mark_students_outcomes_pending(p_student_ids UUID[])
RETURNS VOID AS $$
DECLARE
    v_id UUID;
BEGIN
    FOREACH v_id IN ARRAY p_student_ids
    LOOP
        INSERT INTO employment_status (student_id, status, last_invited_at)
        VALUES (v_id, 'pending', now())
        ON CONFLICT (student_id)
        DO UPDATE SET
            status = 'pending',
            last_invited_at = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- RPC: submit_employment_status(...)
-- Public. Validates email exists, upserts employment_status,
-- marks status as responded.
-- ============================================================
CREATE OR REPLACE FUNCTION submit_employment_status(
    p_email TEXT,
    p_is_working BOOLEAN,
    p_started_month TEXT DEFAULT NULL,
    p_field TEXT DEFAULT NULL,
    p_employment_type TEXT DEFAULT NULL,
    p_responded_at TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_student_email TEXT;
BEGIN
    -- Look up student by exact email match (case-insensitive)
    SELECT id, email
    INTO v_student_id, v_student_email
    FROM students
    WHERE lower(trim(email)) = lower(trim(p_email))
    LIMIT 1;

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This email address does not match any of our records. Please use the email you originally registered with.');
    END IF;

    -- Upsert employment status (re-submission overwrites previous data)
    INSERT INTO employment_status (student_id, email, is_working, started_month, field_of_work, employment_type, status, last_responded_at)
    VALUES (v_student_id, v_student_email, p_is_working, p_started_month, p_field, p_employment_type, 'responded', p_responded_at)
    ON CONFLICT (student_id)
    DO UPDATE SET
        email = EXCLUDED.email,
        is_working = EXCLUDED.is_working,
        started_month = EXCLUDED.started_month,
        field_of_work = EXCLUDED.field_of_work,
        employment_type = EXCLUDED.employment_type,
        status = 'responded',
        last_responded_at = EXCLUDED.last_responded_at;

    RETURN jsonb_build_object('success', true, 'message', 'Thank you! Your employment status has been recorded successfully.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION mark_students_outcomes_pending(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon;
