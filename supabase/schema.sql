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

-- find_students_by_email
-- Added in migration 35: Returns all students with a pending (invited, non-expired)
-- enrollment for a given course to support shared email name picker.
CREATE OR REPLACE FUNCTION find_students_by_email(p_email TEXT, p_course_id UUID)
RETURNS TABLE(student_id UUID, first_name TEXT, last_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.first_name, s.last_name
    FROM students s
    JOIN enrollments e ON e.student_id = s.id
    WHERE lower(trim(s.email)) = lower(trim(p_email))
      AND e.course_id = p_course_id
      AND e.status = 'invited'
      AND (e.invited_at IS NULL OR e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL >= now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.find_students_by_email(TEXT, UUID) TO anon, authenticated;

-- public_confirm_enrollment
-- Called by students via the confirmation link. Validates expiry using
-- per-enrollment response_days. Supports p_student_id for shared email disambiguation.
CREATE OR REPLACE FUNCTION public_confirm_enrollment(
    p_email TEXT,
    p_course_id UUID,
    p_student_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_updated_count INT;
BEGIN
    -- Validate email input
    IF p_email IS NULL OR trim(p_email) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please enter a valid email address.');
    END IF;

    -- Validate course input
    IF p_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid course identifier.');
    END IF;

    -- Locate student
    IF p_student_id IS NOT NULL THEN
        SELECT id INTO v_student_id
        FROM students
        WHERE id = p_student_id
          AND lower(trim(email)) = lower(trim(p_email));
    ELSE
        SELECT id INTO v_student_id
        FROM students
        WHERE lower(trim(email)) = lower(trim(p_email))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_student_id IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM students WHERE lower(trim(email)) = lower(trim(p_email))) THEN
            RETURN jsonb_build_object('success', false, 'message', 'No student found with this email address. Please check your email or contact the organizer.');
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Student record not found. Please try again.');
        END IF;
    END IF;

    -- Update enrollments in 'invited' status and not expired
    IF p_student_id IS NOT NULL THEN
        UPDATE enrollments
        SET status         = 'confirmed',
            confirmed_date = invited_date,
            confirmed_at   = now()
        WHERE student_id = p_student_id
          AND course_id  = p_course_id
          AND status     = 'invited'
          AND (invited_at IS NULL OR invited_at + (COALESCE(response_days, 7) || ' days')::INTERVAL >= now());
    ELSE
        UPDATE enrollments e
        SET status         = 'confirmed',
            confirmed_date = e.invited_date,
            confirmed_at   = now()
        FROM students s
        WHERE e.student_id = s.id
          AND lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id  = p_course_id
          AND e.status     = 'invited'
          AND (e.invited_at IS NULL OR e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL >= now());
    END IF;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Your attendance has been confirmed! We look forward to seeing you at the course.');
    END IF;

    -- If nothing was updated, provide a helpful and precise reason:

    -- 1. Already confirmed
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'confirmed'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Your attendance has already been confirmed! We look forward to seeing you at the course.');
    END IF;

    -- 2. Already completed
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'completed'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'You have already completed this course.');
    END IF;

    -- 3. Invitation expired
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'invited'
          AND e.invited_at IS NOT NULL
          AND e.invited_at + (COALESCE(e.response_days, 7) || ' days')::INTERVAL < now()
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Your invitation has expired. The confirmation window has passed. Please contact the organizer for a new invitation.'
        );
    END IF;

    -- 4. Requested (waiting list)
    IF EXISTS (
        SELECT 1 FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND e.course_id = p_course_id
          AND e.status = 'requested'
          AND (p_student_id IS NULL OR e.student_id = p_student_id)
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Your application is on the waiting list, but an invitation has not been sent yet. Please wait for your invitation email.'
        );
    END IF;

    -- 5. No enrollment for this course
    RETURN jsonb_build_object(
        'success', false,
        'message', 'No pending invitation found for this course. Please contact the organizer.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_confirm_enrollment(TEXT, UUID, UUID) TO anon, authenticated;


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
    v_attempts INT := 0;
BEGIN
    SELECT token INTO v_existing
    FROM confirmation_tokens
    WHERE course_id = p_course_id AND course_date = p_course_date AND expires_at > now()
    LIMIT 1;

    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

    LOOP
        v_attempts := v_attempts + 1;
        IF v_attempts > 100 THEN
            RAISE EXCEPTION 'Failed to generate a unique confirmation token after 100 attempts.';
        END IF;

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

-- cleanup_expired_confirmation_tokens
-- Utility to purge expired tokens from the confirmation_tokens table.
CREATE OR REPLACE FUNCTION cleanup_expired_confirmation_tokens()
RETURNS INT AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM confirmation_tokens WHERE expires_at < now();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION cleanup_expired_confirmation_tokens() TO authenticated;

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

-- find_employment_students_by_email
-- Returns all students with a matching email for employment disambiguation.
CREATE OR REPLACE FUNCTION find_employment_students_by_email(p_email TEXT)
RETURNS TABLE(student_id UUID, first_name TEXT, last_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.first_name, s.last_name
    FROM students s
    WHERE lower(trim(s.email)) = lower(trim(p_email))
    ORDER BY s.first_name, s.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION find_employment_students_by_email(TEXT) TO anon, authenticated;

-- submit_employment_status
-- Public (anon). Called from the graduate outcome form.
-- Validates email, upserts employment_status, marks as responded.
-- Supports optional p_student_id parameter when multiple students share an email.
CREATE OR REPLACE FUNCTION submit_employment_status(
    p_email           TEXT,
    p_is_working      BOOLEAN,
    p_started_month   TEXT        DEFAULT NULL,
    p_field           TEXT        DEFAULT NULL,
    p_employment_type TEXT        DEFAULT NULL,
    p_responded_at    TIMESTAMPTZ DEFAULT now(),
    p_student_id      UUID        DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_student_id    UUID;
    v_student_email TEXT;
BEGIN
    IF p_student_id IS NOT NULL THEN
        SELECT id, email INTO v_student_id, v_student_email
        FROM students
        WHERE id = p_student_id
          AND lower(trim(email)) = lower(trim(p_email));
    ELSE
        SELECT id, email INTO v_student_id, v_student_email
        FROM students
        WHERE lower(trim(email)) = lower(trim(p_email))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

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

GRANT EXECUTE ON FUNCTION submit_employment_status(TEXT, BOOLEAN, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO anon, authenticated;


-- ============================================================
-- STUDENT MERGE RPC
-- ============================================================
CREATE OR REPLACE FUNCTION merge_students(p_primary_id UUID, p_duplicate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_primary students%ROWTYPE;
    v_duplicate students%ROWTYPE;
    
    v_enrollment RECORD;
    v_existing_id UUID;
    v_existing_status TEXT;
    
    v_flag RECORD;
    v_existing_flag_id UUID;
    v_existing_flag_comment TEXT;
    
    v_prim_emp_id UUID;
    v_prim_emp_status TEXT;
    v_prim_working BOOLEAN;
    v_prim_started TEXT;
    v_prim_field TEXT;
    v_prim_type TEXT;
    v_prim_invited TIMESTAMPTZ;
    v_prim_responded TIMESTAMPTZ;
    
    v_dup_emp_id UUID;
    v_dup_emp_status TEXT;
    v_dup_working BOOLEAN;
    v_dup_started TEXT;
    v_dup_field TEXT;
    v_dup_type TEXT;
    v_dup_invited TIMESTAMPTZ;
    v_dup_responded TIMESTAMPTZ;
BEGIN
    IF p_primary_id = p_duplicate_id THEN
        RAISE EXCEPTION 'Cannot merge a student into themselves.';
    END IF;

    -- Lock both student rows in deterministic order to prevent race conditions & deadlocks
    IF p_primary_id < p_duplicate_id THEN
        PERFORM id FROM students WHERE id = p_primary_id FOR UPDATE;
        PERFORM id FROM students WHERE id = p_duplicate_id FOR UPDATE;
    ELSE
        PERFORM id FROM students WHERE id = p_duplicate_id FOR UPDATE;
        PERFORM id FROM students WHERE id = p_primary_id FOR UPDATE;
    END IF;

    -- 1. Fetch details of both students
    SELECT * INTO v_primary FROM students WHERE id = p_primary_id;
    SELECT * INTO v_duplicate FROM students WHERE id = p_duplicate_id;
    
    IF v_primary.id IS NULL THEN
        RAISE EXCEPTION 'Primary student with ID % not found.', p_primary_id;
    END IF;
    IF v_duplicate.id IS NULL THEN
        RAISE EXCEPTION 'Duplicate student with ID % not found.', p_duplicate_id;
    END IF;

    -- 2. Consolidate Enrollments (deduplicating by course_id)
    FOR v_enrollment IN 
        SELECT * FROM enrollments 
        WHERE student_id = p_duplicate_id 
        ORDER BY created_at ASC 
    LOOP
        SELECT id, status INTO v_existing_id, v_existing_status
        FROM enrollments
        WHERE student_id = p_primary_id
          AND course_id = v_enrollment.course_id
        ORDER BY 
          (CASE WHEN COALESCE(course_variant, '') = COALESCE(v_enrollment.course_variant, '') THEN 0 ELSE 1 END),
          (CASE status 
             WHEN 'completed' THEN 1 
             WHEN 'confirmed' THEN 2 
             WHEN 'invited'   THEN 3 
             WHEN 'requested' THEN 4 
             ELSE 5 
           END),
          created_at ASC
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE enrollments
            SET 
                status = CASE 
                    WHEN (
                        CASE v_enrollment.status 
                            WHEN 'completed' THEN 1 
                            WHEN 'confirmed' THEN 2 
                            WHEN 'invited'   THEN 3 
                            WHEN 'requested' THEN 4 
                            ELSE 5 
                        END
                    ) < (
                        CASE v_existing_status 
                            WHEN 'completed' THEN 1 
                            WHEN 'confirmed' THEN 2 
                            WHEN 'invited'   THEN 3 
                            WHEN 'requested' THEN 4 
                            ELSE 5 
                        END
                    ) THEN v_enrollment.status
                    ELSE status
                END,
                created_at = LEAST(created_at, v_enrollment.created_at),
                is_priority = (COALESCE(is_priority, false) OR COALESCE(v_enrollment.is_priority, false)),
                invited_date = COALESCE(invited_date, v_enrollment.invited_date),
                confirmed_date = COALESCE(confirmed_date, v_enrollment.confirmed_date),
                completed_date = COALESCE(completed_date, v_enrollment.completed_date),
                invited_at = COALESCE(invited_at, v_enrollment.invited_at),
                confirmed_at = COALESCE(confirmed_at, v_enrollment.confirmed_at),
                completed_at = COALESCE(completed_at, v_enrollment.completed_at),
                response_days = COALESCE(response_days, v_enrollment.response_days),
                course_variant = COALESCE(NULLIF(TRIM(course_variant), ''), v_enrollment.course_variant),
                notes = CASE
                    WHEN notes IS NOT NULL AND v_enrollment.notes IS NOT NULL AND TRIM(notes) <> '' AND TRIM(v_enrollment.notes) <> '' AND notes <> v_enrollment.notes
                        THEN TRIM(notes || ' | ' || v_enrollment.notes)
                    ELSE COALESCE(NULLIF(TRIM(notes), ''), v_enrollment.notes)
                END,
                updated_at = now()
            WHERE id = v_existing_id;

            DELETE FROM enrollments WHERE id = v_enrollment.id;
        ELSE
            UPDATE enrollments 
            SET student_id = p_primary_id,
                updated_at = now()
            WHERE id = v_enrollment.id;
        END IF;
    END LOOP;

    -- 3. Consolidate Student Flags
    FOR v_flag IN SELECT * FROM student_flags WHERE student_id = p_duplicate_id LOOP
        SELECT id, comment INTO v_existing_flag_id, v_existing_flag_comment
        FROM student_flags
        WHERE student_id = p_primary_id AND course_id = v_flag.course_id
        LIMIT 1;

        IF v_existing_flag_id IS NOT NULL THEN
            UPDATE student_flags
            SET comment = CASE
                WHEN v_flag.comment IS NOT NULL AND v_existing_flag_comment IS NOT NULL AND v_flag.comment <> v_existing_flag_comment 
                    THEN v_existing_flag_comment || '; ' || v_flag.comment
                ELSE COALESCE(v_existing_flag_comment, v_flag.comment)
            END
            WHERE id = v_existing_flag_id;
            
            DELETE FROM student_flags WHERE id = v_flag.id;
        ELSE
            UPDATE student_flags SET student_id = p_primary_id WHERE id = v_flag.id;
        END IF;
    END LOOP;

    -- 4. Consolidate Employment Status
    SELECT id, status, is_working, started_month, field_of_work, employment_type, last_invited_at, last_responded_at
    INTO v_prim_emp_id, v_prim_emp_status, v_prim_working, v_prim_started, v_prim_field, v_prim_type, v_prim_invited, v_prim_responded
    FROM employment_status
    WHERE student_id = p_primary_id;

    SELECT id, status, is_working, started_month, field_of_work, employment_type, last_invited_at, last_responded_at
    INTO v_dup_emp_id, v_dup_emp_status, v_dup_working, v_dup_started, v_dup_field, v_dup_type, v_dup_invited, v_dup_responded
    FROM employment_status
    WHERE student_id = p_duplicate_id;

    IF v_prim_emp_id IS NOT NULL AND v_dup_emp_id IS NOT NULL THEN
        IF v_dup_emp_status = 'responded' AND v_prim_emp_status <> 'responded' THEN
            UPDATE employment_status
            SET is_working = v_dup_working,
                started_month = v_dup_started,
                field_of_work = v_dup_field,
                employment_type = v_dup_type,
                status = 'responded',
                last_invited_at = COALESCE(last_invited_at, v_dup_invited),
                last_responded_at = v_dup_responded
            WHERE id = v_prim_emp_id;
        ELSE
            UPDATE employment_status
            SET last_invited_at = COALESCE(last_invited_at, v_dup_invited),
                last_responded_at = COALESCE(last_responded_at, v_dup_responded)
            WHERE id = v_prim_emp_id;
        END IF;
        
        DELETE FROM employment_status WHERE id = v_dup_emp_id;
    ELSIF v_dup_emp_id IS NOT NULL THEN
        UPDATE employment_status SET student_id = p_primary_id WHERE id = v_dup_emp_id;
    END IF;

    -- 5. Delete Duplicate Student Profile
    DELETE FROM students WHERE id = p_duplicate_id;

    -- 6. Clean up student_non_duplicates
    DELETE FROM student_non_duplicates WHERE student_a_id = p_duplicate_id OR student_b_id = p_duplicate_id;

    -- 7. Enrich Primary Student Info (preserving primary's values unless NULL)
    UPDATE students
    SET
        first_name = COALESCE(NULLIF(TRIM(first_name), ''), v_duplicate.first_name),
        last_name  = COALESCE(NULLIF(TRIM(last_name), ''), v_duplicate.last_name),
        phone      = COALESCE(NULLIF(TRIM(phone), ''), v_duplicate.phone),
        address    = COALESCE(NULLIF(TRIM(address), ''), v_duplicate.address),
        eircode    = COALESCE(NULLIF(TRIM(eircode), ''), v_duplicate.eircode),
        dob        = COALESCE(dob, v_duplicate.dob),
        created_at = LEAST(created_at, v_duplicate.created_at)
    WHERE id = p_primary_id;

END;
$$;

REVOKE EXECUTE ON FUNCTION merge_students(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_students(UUID, UUID) TO authenticated;


-- ============================================================
-- REALTIME
-- (Run in Supabase Dashboard → Database → Replication, or via SQL)
-- ============================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE enrollments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE students;
-- ALTER PUBLICATION supabase_realtime ADD TABLE courses;
-- ALTER PUBLICATION supabase_realtime ADD TABLE student_flags;
-- ALTER PUBLICATION supabase_realtime ADD TABLE employment_status;
