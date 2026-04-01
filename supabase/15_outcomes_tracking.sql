-- ============================================================
-- Outcomes Tracking: Employment Status of Graduates
-- Personal short tokens (7-day expiry) + employment_status table
-- ============================================================

-- Table: status_tokens
-- Personal short tokens sent to graduates to collect employment status.
CREATE TABLE IF NOT EXISTS status_tokens (
    token TEXT PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
    responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_status_tokens_student ON status_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_status_tokens_expires ON status_tokens(expires_at);

ALTER TABLE status_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage status_tokens"
    ON status_tokens FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Anon can read status_tokens"
    ON status_tokens FOR SELECT
    USING (true);

-- ============================================================
-- Table: employment_status
-- Stores the latest employment info for each student.
-- ============================================================
CREATE TABLE IF NOT EXISTS employment_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL,
    is_working BOOLEAN NOT NULL DEFAULT false,
    started_month TEXT,          -- 'YYYY-MM' format
    field_of_work TEXT,
    employment_type TEXT,        -- 'full_time' or 'part_time'
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employment_status_student ON employment_status(student_id);

ALTER TABLE employment_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage employment_status"
    ON employment_status FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- RPC: create_status_token(p_student_id UUID) → TEXT
-- Generates a personal 7-char token for a specific student.
-- Reuses an existing active token if one exists.
-- ============================================================
CREATE OR REPLACE FUNCTION create_status_token(
    p_student_id UUID
) RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
    v_existing TEXT;
    v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_i INT;
BEGIN
    -- Reuse existing active token for this student
    SELECT token INTO v_existing
    FROM status_tokens
    WHERE student_id = p_student_id
      AND expires_at > now()
      AND responded_at IS NULL
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Generate a unique 7-char token
    LOOP
        v_token := '';
        FOR v_i IN 1..7 LOOP
            v_token := v_token || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;

        -- Check uniqueness across both token tables
        IF NOT EXISTS (SELECT 1 FROM status_tokens WHERE token = v_token)
           AND NOT EXISTS (SELECT 1 FROM confirmation_tokens WHERE token = v_token) THEN
            EXIT;
        END IF;
    END LOOP;

    INSERT INTO status_tokens (token, student_id)
    VALUES (v_token, p_student_id);

    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: resolve_status_token(p_token TEXT)
-- Public. Looks up a status token and returns student info.
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_status_token(p_token TEXT)
RETURNS TABLE(student_id UUID, first_name TEXT, last_name TEXT, email TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.first_name, s.last_name, s.email
    FROM status_tokens st
    JOIN students s ON s.id = st.student_id
    WHERE st.token = p_token
      AND st.expires_at > now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: submit_employment_status(...)
-- Public. Validates token + email, upserts employment_status,
-- marks token as responded.
-- ============================================================
CREATE OR REPLACE FUNCTION submit_employment_status(
    p_token TEXT,
    p_email TEXT,
    p_is_working BOOLEAN,
    p_started_month TEXT DEFAULT NULL,
    p_field TEXT DEFAULT NULL,
    p_employment_type TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_student_email TEXT;
BEGIN
    -- Resolve token
    SELECT st.student_id, s.email
    INTO v_student_id, v_student_email
    FROM status_tokens st
    JOIN students s ON s.id = st.student_id
    WHERE st.token = p_token
      AND st.expires_at > now();

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This link is invalid or has expired. Please contact the organizer for a new link.');
    END IF;

    -- Verify email matches (case-insensitive)
    IF lower(trim(p_email)) <> lower(trim(v_student_email)) THEN
        RETURN jsonb_build_object('success', false, 'message', 'The email address does not match our records. Please use the email you registered with.');
    END IF;

    -- Upsert employment status
    INSERT INTO employment_status (student_id, email, is_working, started_month, field_of_work, employment_type, last_updated_at)
    VALUES (v_student_id, trim(p_email), p_is_working, p_started_month, p_field, p_employment_type, now())
    ON CONFLICT (student_id)
    DO UPDATE SET
        email = EXCLUDED.email,
        is_working = EXCLUDED.is_working,
        started_month = EXCLUDED.started_month,
        field_of_work = EXCLUDED.field_of_work,
        employment_type = EXCLUDED.employment_type,
        last_updated_at = now();

    -- Mark token as responded
    UPDATE status_tokens
    SET responded_at = now()
    WHERE token = p_token;

    RETURN jsonb_build_object('success', true, 'message', 'Thank you! Your employment status has been recorded successfully.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION create_status_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_status_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_employment_status(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO anon;

-- Allow anon to update status_tokens (for responded_at via the RPC)
-- The RPC runs as SECURITY DEFINER so no separate policy needed for anon writes.
