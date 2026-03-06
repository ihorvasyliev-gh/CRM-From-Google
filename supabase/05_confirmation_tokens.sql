-- ============================================================
-- Short Confirmation Tokens
-- Replaces long ?course_id=UUID&date=... URLs with /c/Xk9mQ2
-- ============================================================

-- Table to store short tokens
CREATE TABLE IF NOT EXISTS confirmation_tokens (
    token TEXT PRIMARY KEY,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    course_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days')
);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_expires ON confirmation_tokens(expires_at);

-- RLS: authenticated users can create tokens, anon can read (resolve) them
ALTER TABLE confirmation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage tokens"
    ON confirmation_tokens FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Anon can read tokens"
    ON confirmation_tokens FOR SELECT
    USING (true);

-- ============================================================
-- RPC: create_confirmation_token
-- Called by admin when sending invite emails.
-- Generates a unique 7-char alphanumeric token.
-- If an identical course_id + course_date combo exists, reuse it.
-- ============================================================
CREATE OR REPLACE FUNCTION create_confirmation_token(
    p_course_id UUID,
    p_course_date DATE
) RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
    v_existing TEXT;
    v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_i INT;
BEGIN
    -- Reuse existing token for the same course+date combo (if not expired)
    SELECT token INTO v_existing
    FROM confirmation_tokens
    WHERE course_id = p_course_id
      AND course_date = p_course_date
      AND expires_at > now()
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

        -- Check uniqueness
        IF NOT EXISTS (SELECT 1 FROM confirmation_tokens WHERE token = v_token) THEN
            EXIT;
        END IF;
    END LOOP;

    INSERT INTO confirmation_tokens (token, course_id, course_date)
    VALUES (v_token, p_course_id, p_course_date);

    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: resolve_confirmation_token
-- Public (anon). Looks up token and returns course info.
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_confirmation_token(p_token TEXT)
RETURNS TABLE(course_id UUID, course_date DATE, course_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT ct.course_id, ct.course_date, c.name
    FROM confirmation_tokens ct
    JOIN courses c ON c.id = ct.course_id
    WHERE ct.token = p_token
      AND ct.expires_at > now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access
GRANT EXECUTE ON FUNCTION create_confirmation_token(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_confirmation_token(TEXT) TO anon;
