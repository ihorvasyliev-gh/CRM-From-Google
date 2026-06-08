-- ============================================================
-- schema.sql — Current Database Schema (auto-generated)
-- Reflects all migrations 01 → 22 + add_updated_at + update_dates_rpc
-- Last updated: 2026-05-26
-- DO NOT edit by hand — apply changes via numbered migration files.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Students
CREATE TABLE IF NOT EXISTS students (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name      TEXT,
    last_name       TEXT,
    email           TEXT        UNIQUE,
    phone           TEXT,
    address         TEXT,
    eircode         TEXT,
    normalized_eircode TEXT GENERATED ALWAYS AS (upper(replace(eircode, ' '::text, ''::text))) STORED,
    dob             DATE,
    last_synced_at  TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enrollments
-- Tracks a student's participation in a course (per variant).
CREATE TABLE IF NOT EXISTS enrollments (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID        REFERENCES students(id) ON DELETE CASCADE,
    course_id       UUID        REFERENCES courses(id)  ON DELETE CASCADE,
    status          TEXT        DEFAULT 'requested'
                                CHECK (status IN ('requested','invited','confirmed','completed','withdrawn','rejected')),
    course_variant  TEXT,                   -- e.g. "Ukrainian", "English"
    notes           TEXT,                   -- admin notes
    is_priority     BOOLEAN     DEFAULT false,
    invited_date    DATE,                   -- course date sent in invitation email
    confirmed_date  DATE,                   -- date when place was confirmed
    completed_date  DATE,                   -- date when enrollment was completed
    invited_at      TIMESTAMPTZ,            -- timestamp when invitation email was sent (for expiry check)
    confirmed_at    TIMESTAMPTZ,            -- timestamp when student confirmed (analytics)
    completed_at    TIMESTAMPTZ,            -- timestamp when enrollment was completed (analytics)
    response_days   INTEGER     DEFAULT 7,  -- configurable confirmation deadline (days)
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (student_id, course_id, course_variant)
);

-- Invite Dates (reusable per-course dates for invitation emails)
CREATE TABLE IF NOT EXISTS invite_dates (
    id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id   UUID  REFERENCES courses(id) ON DELETE CASCADE,
    invite_date DATE  NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (course_id, invite_date)
);

-- Document Templates (.docx templates for letter generation)
CREATE TABLE IF NOT EXISTS document_templates (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    is_active    BOOLEAN DEFAULT true,   -- multi-template support (migration 12)
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Attendance Templates (.docx template for the attendance register)
CREATE TABLE IF NOT EXISTS attendance_templates (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Label Templates (.docx template for address label stickers)
CREATE TABLE IF NOT EXISTS label_templates (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Short Confirmation Tokens (for /c/:token invitation links)
CREATE TABLE IF NOT EXISTS confirmation_tokens (
    token      TEXT PRIMARY KEY,
    course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    course_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '90 days')
);

-- Template Variables (custom placeholders, e.g. {Tutor})
CREATE TABLE IF NOT EXISTS template_variables (
    id        UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    var_key   TEXT  NOT NULL UNIQUE,
    var_value TEXT  NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Employment Status (graduate outcomes tracking)
CREATE TABLE IF NOT EXISTS employment_status (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id        UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
    email             TEXT,
    is_working        BOOLEAN,
    started_month     TEXT,           -- 'YYYY-MM' format
    field_of_work     TEXT,
    employment_type   TEXT,           -- 'full_time' or 'part_time'
    status            TEXT DEFAULT 'pending',  -- 'pending' or 'responded'
    last_invited_at   TIMESTAMPTZ,
    last_responded_at TIMESTAMPTZ
);

-- Student Flags (marks students who didn't pass, etc.)
CREATE TABLE IF NOT EXISTS student_flags (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id)  ON DELETE CASCADE NOT NULL,
    course_id  UUID REFERENCES courses(id)   ON DELETE CASCADE NOT NULL,
    comment    TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- User Settings (per-user app configuration, synced from localStorage)
CREATE TABLE IF NOT EXISTS user_settings (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_students_email          ON students(email);
CREATE INDEX IF NOT EXISTS idx_students_phone          ON students(phone);
CREATE INDEX IF NOT EXISTS idx_students_normalized_eircode ON students(normalized_eircode);
CREATE INDEX IF NOT EXISTS idx_courses_name            ON courses(name);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id  ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id   ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_employment_status_student ON employment_status(student_id);
CREATE INDEX IF NOT EXISTS idx_student_flags_student   ON student_flags(student_id);
CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_expires ON confirmation_tokens(expires_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE students            ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_dates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_variables  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_status   ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_flags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings       ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage all core data
CREATE POLICY "Authenticated access" ON students
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON courses
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON enrollments
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON invite_dates
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON document_templates
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON attendance_templates
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON label_templates
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON template_variables
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can manage employment_status" ON employment_status
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON student_flags
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Users can only manage their own settings
CREATE POLICY "Users can manage their own settings" ON user_settings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Confirmation tokens: authenticated admins can create, anon can read (to resolve /c/:token links)
CREATE POLICY "Authenticated can manage tokens" ON confirmation_tokens
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Anon can read tokens" ON confirmation_tokens
    FOR SELECT USING (true);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at on enrollments
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_enrollments_updated_at ON enrollments;
CREATE TRIGGER update_enrollments_updated_at
    BEFORE UPDATE ON enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FUNCTIONS (RPCs)
-- ============================================================

-- public_confirm_enrollment
-- Called by students via the confirmation link. Validates expiry using
-- per-enrollment response_days. Records confirmed_at timestamp.
CREATE OR REPLACE FUNCTION public_confirm_enrollment(p_email TEXT, p_course_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_updated_count INT;
    v_has_expired BOOLEAN;
BEGIN
    SELECT id INTO v_student_id
    FROM students WHERE lower(email) = lower(p_email);

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No student found with this email address.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM enrollments
        WHERE student_id = v_student_id
          AND course_id = p_course_id
          AND status = 'invited'
          AND invited_at IS NOT NULL
          AND invited_at + (COALESCE(response_days, 7) || ' days')::INTERVAL < now()
    ) INTO v_has_expired;

    IF v_has_expired THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Your invitation has expired. The confirmation window has passed. Please contact the organizer for a new invitation.'
        );
    END IF;

    UPDATE enrollments
    SET status         = 'confirmed',
        confirmed_date = invited_date,
        confirmed_at   = now()
    WHERE student_id = v_student_id
      AND course_id  = p_course_id
      AND status     = 'invited'
      AND (invited_at IS NULL OR invited_at + (COALESCE(response_days, 7) || ' days')::INTERVAL >= now());

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        IF EXISTS (
            SELECT 1 FROM enrollments
            WHERE student_id = v_student_id AND course_id = p_course_id AND status = 'confirmed'
        ) THEN
            RETURN jsonb_build_object('success', true, 'message', 'Your attendance has already been confirmed.');
        END IF;
        RETURN jsonb_build_object('success', false, 'message', 'No pending invitation found for this course. Please contact the organizer.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Your attendance has been confirmed! We look forward to seeing you.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public_confirm_enrollment(TEXT, UUID) TO anon;

-- ──────────────────────────────────────────────────────────────

-- get_public_course_info
-- Public read-only lookup of course name by ID (used on confirmation page).
CREATE OR REPLACE FUNCTION get_public_course_info(p_course_id UUID)
RETURNS TABLE(course_name TEXT) AS $$
BEGIN
    RETURN QUERY SELECT c.name FROM courses c WHERE c.id = p_course_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_public_course_info(UUID) TO anon;

-- ──────────────────────────────────────────────────────────────

-- create_confirmation_token
-- Admin-only. Creates or reuses a 7-char token for a course+date combo.
CREATE OR REPLACE FUNCTION create_confirmation_token(p_course_id UUID, p_course_date DATE)
RETURNS TEXT AS $$
DECLARE
    v_token    TEXT;
    v_existing TEXT;
    v_chars    TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    v_i        INT;
BEGIN
    SELECT token INTO v_existing
    FROM confirmation_tokens
    WHERE course_id = p_course_id AND course_date = p_course_date AND expires_at > now()
    LIMIT 1;

    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

    LOOP
        v_token := '';
        FOR v_i IN 1..7 LOOP
            v_token := v_token || substr(v_chars, floor(random() * length(v_chars) + 1)::INT, 1);
        END LOOP;
        IF NOT EXISTS (SELECT 1 FROM confirmation_tokens WHERE token = v_token) THEN EXIT; END IF;
    END LOOP;

    INSERT INTO confirmation_tokens (token, course_id, course_date) VALUES (v_token, p_course_id, p_course_date);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION create_confirmation_token(UUID, DATE) TO authenticated;

-- ──────────────────────────────────────────────────────────────

-- resolve_confirmation_token
-- Public. Resolves a short token to course info (used on /c/:token page).
CREATE OR REPLACE FUNCTION resolve_confirmation_token(p_token TEXT)
RETURNS TABLE(course_id UUID, course_date DATE, course_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT ct.course_id, ct.course_date, c.name
    FROM confirmation_tokens ct
    JOIN courses c ON c.id = ct.course_id
    WHERE ct.token = p_token AND ct.expires_at > now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION resolve_confirmation_token(TEXT) TO anon;

-- ──────────────────────────────────────────────────────────────

-- bulk_update_registration_dates
-- Admin utility. Updates enrollment and student created_at to match
-- the original Google Forms submission timestamp.
CREATE OR REPLACE FUNCTION bulk_update_registration_dates(updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    elem JSONB;
BEGIN
    FOR elem IN SELECT * FROM jsonb_array_elements(updates)
    LOOP
        UPDATE enrollments
        SET created_at = (elem->>'created_at')::TIMESTAMPTZ
        WHERE student_id    = (elem->>'student_id')::UUID
          AND course_id     = (elem->>'course_id')::UUID
          AND course_variant = elem->>'course_variant';

        UPDATE students
        SET created_at = LEAST(created_at, (elem->>'created_at')::TIMESTAMPTZ)
        WHERE id = (elem->>'student_id')::UUID;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_update_registration_dates(JSONB) TO authenticated;

-- ──────────────────────────────────────────────────────────────

-- mark_students_outcomes_pending
-- Bulk-marks graduates as 'pending' for employment follow-up.
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
        DO UPDATE SET status = 'pending', last_invited_at = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION mark_students_outcomes_pending(UUID[]) TO authenticated;

-- ──────────────────────────────────────────────────────────────

-- submit_employment_status
-- Public (anon). Called from the graduate outcome form.
-- Validates email, upserts employment_status, marks as responded.
CREATE OR REPLACE FUNCTION submit_employment_status(
    p_email           TEXT,
    p_is_working      BOOLEAN,
    p_started_month   TEXT        DEFAULT NULL,
    p_field           TEXT        DEFAULT NULL,
    p_employment_type TEXT        DEFAULT NULL,
    p_responded_at    TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB AS $$
DECLARE
    v_student_id    UUID;
    v_student_email TEXT;
BEGIN
    SELECT id, email INTO v_student_id, v_student_email
    FROM students
    WHERE lower(trim(email)) = lower(trim(p_email))
    LIMIT 1;

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This email address does not match any of our records. Please use the email you originally registered with.');
    END IF;

    INSERT INTO employment_status (student_id, email, is_working, started_month, field_of_work, employment_type, status, last_responded_at)
    VALUES (v_student_id, v_student_email, p_is_working, p_started_month, p_field, p_employment_type, 'responded', p_responded_at)
    ON CONFLICT (student_id)
    DO UPDATE SET
        email             = EXCLUDED.email,
        is_working        = EXCLUDED.is_working,
        started_month     = EXCLUDED.started_month,
        field_of_work     = EXCLUDED.field_of_work,
        employment_type   = EXCLUDED.employment_type,
        status            = 'responded',
        last_responded_at = EXCLUDED.last_responded_at;

    RETURN jsonb_build_object('success', true, 'message', 'Thank you! Your employment status has been recorded successfully.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon;

-- ============================================================
-- REALTIME
-- (Run in Supabase Dashboard → Database → Replication, or via SQL)
-- ============================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE enrollments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE students;
-- ALTER PUBLICATION supabase_realtime ADD TABLE courses;
-- ALTER PUBLICATION supabase_realtime ADD TABLE student_flags;
-- ALTER PUBLICATION supabase_realtime ADD TABLE employment_status;
