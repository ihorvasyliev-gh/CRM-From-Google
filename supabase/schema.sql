-- ============================================================
-- schema.sql — Reference baseline database schema (migrations 01–101)
--
-- Reflects all public.* tables, columns, primary keys, foreign keys,
-- CHECK/UNIQUE constraints, and key indexes as of migration 101
-- (supabase/101_student_filters_rpc.sql).
--
-- RPCs, triggers, views, storage policies, and role-based RLS policies
-- (including is_app_admin() and viewer/outreach/forms restrictions) are
-- applied and maintained via the numbered migrations (01 → latest).
--
-- Fresh install: run this file, then every numbered migration
-- (01 → latest) in order. Do not add new schema changes directly here
-- without a corresponding numbered migration.
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- Students
CREATE TABLE IF NOT EXISTS students (
    id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name         TEXT,
    last_name          TEXT,
    email              TEXT,
    phone              TEXT,
    address            TEXT,
    eircode            TEXT,
    normalized_eircode TEXT        GENERATED ALWAYS AS (upper(replace(eircode, ' '::text, ''::text))) STORED, -- migration 28
    dob                DATE,
    last_synced_at     TIMESTAMPTZ DEFAULT now(),
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(), -- migration 84
    CONSTRAINT students_first_last_email_key UNIQUE (first_name, last_name, email) -- migrations 01, 02
);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             TEXT        UNIQUE NOT NULL,
    requires_english BOOLEAN     NOT NULL DEFAULT false, -- High English invite template flag (migration 43)
    max_capacity     INTEGER     CONSTRAINT courses_max_capacity_positive CHECK (max_capacity IS NULL OR max_capacity > 0), -- NULL = unlimited (migration 57)
    template_ids     UUID[]      NOT NULL DEFAULT '{}',  -- document template preset; empty = all active (migration 67)
    email_templates  JSONB       NOT NULL DEFAULT '{}'::jsonb, -- course card text in invite/reminder emails (migration 68)
    archived_at      TIMESTAMPTZ,                        -- soft-archive timestamp; NULL = active (migration 100)
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()  -- migration 84
);

-- Enrollments
-- Tracks a student's participation in a course (per variant).
CREATE TABLE IF NOT EXISTS enrollments (
    id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id                  UUID        REFERENCES students(id) ON DELETE CASCADE,
    course_id                   UUID        REFERENCES courses(id)  ON DELETE CASCADE,
    status                      TEXT        DEFAULT 'requested'
                                            CONSTRAINT enrollments_status_check
                                            CHECK (status IN ('requested','invited','confirmed','completed','withdrawn','rejected')), -- migration 09
    course_variant              TEXT,                   -- e.g. "Ukrainian", "English"
    notes                       TEXT,                   -- admin notes
    is_priority                 BOOLEAN     DEFAULT false,
    invited_date                DATE,                   -- course date sent in invitation email
    invited_dates               DATE[],                 -- dates offered in a multi-date invitation; cleared on confirmation (migration 59)
    confirmed_date              DATE,                   -- date when place was confirmed
    completed_date              DATE,                   -- date when enrollment was completed (migration 03)
    invited_at                  TIMESTAMPTZ,            -- timestamp when invitation email was sent (migration 08)
    confirmed_at                TIMESTAMPTZ,            -- timestamp when student confirmed (migration 20)
    completed_at                TIMESTAMPTZ,            -- timestamp when enrollment was completed (migration 20)
    response_days               INTEGER     DEFAULT 7,  -- configurable confirmation deadline in days (migration 19)
    pending_completion_date     DATE,                   -- viewer-submitted completion date awaiting approval (migration 41)
    completion_requested_at     TIMESTAMPTZ,            -- migration 41
    completion_requested_by     TEXT,                   -- migration 41
    completion_request_status   TEXT        DEFAULT 'none'
                                            CONSTRAINT enrollments_completion_request_status_check
                                            CHECK (completion_request_status IN ('none', 'pending', 'approved', 'rejected')), -- migration 41
    completion_rejection_reason TEXT,                   -- migration 41
    exclude_from_reports        BOOLEAN     DEFAULT false, -- course run marked "Ignore in reports" (migration 82)
    confirmed_push_sent_at      TIMESTAMPTZ,            -- deduplication stamp for confirmation push alerts (migration 98)
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (student_id, course_id, course_variant)
);

-- Invite Dates (reusable per-course dates for invitation emails)
CREATE TABLE IF NOT EXISTS invite_dates (
    id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id                 UUID        REFERENCES courses(id) ON DELETE CASCADE,
    invite_date               DATE        NOT NULL,
    reminder_sent_at          TIMESTAMPTZ, -- 7-day attendance reminder sent (migration 70)
    reminder_tomorrow_sent_at TIMESTAMPTZ, -- day-before reminder sent (migration 76)
    start_time                TIME,        -- default start time of every day (migration 79)
    end_time                  TIME,        -- default end time of every day (migration 79)
    location                  TEXT         CONSTRAINT invite_dates_location_length CHECK (location IS NULL OR char_length(location) <= 500), -- migration 79
    days                      JSONB        CONSTRAINT invite_dates_days_is_array CHECK (days IS NULL OR jsonb_typeof(days) = 'array'), -- [{date, start?, end?}] (migration 79)
    created_at                TIMESTAMPTZ DEFAULT now(),
    UNIQUE (course_id, invite_date)
);

-- Short Confirmation Tokens (for /c/:token invitation links; migrations 05, 59)
CREATE TABLE IF NOT EXISTS confirmation_tokens (
    token        TEXT        PRIMARY KEY,
    course_id    UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    course_date  DATE,
    course_dates DATE[],     -- dates offered by a multi-date link; NULL = single date in course_date (migration 59)
    created_at   TIMESTAMPTZ DEFAULT now(),
    expires_at   TIMESTAMPTZ DEFAULT (now() + INTERVAL '90 days')
);

-- Student Flags (marks students who didn't pass, etc.; migration 17)
CREATE TABLE IF NOT EXISTS student_flags (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id  UUID        NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
    comment    TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Student Non-Duplicates (pairs of distinct people sharing email/phone; migration 24)
CREATE TABLE IF NOT EXISTS student_non_duplicates (
    student_a_id UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_b_id UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (student_a_id, student_b_id),
    CONSTRAINT check_student_order CHECK (student_a_id < student_b_id)
);

-- Employment Status (graduate outcomes tracking; migrations 15, 90, 92)
CREATE TABLE IF NOT EXISTS employment_status (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id          UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
    email               TEXT,
    is_working          BOOLEAN,
    started_month       TEXT,                   -- 'YYYY-MM' format
    field_of_work       TEXT,
    employment_type     TEXT,                   -- 'full_time', 'part_time', 'self_employed', 'ce_tus'
    status              TEXT        DEFAULT 'pending', -- 'pending' or 'responded'
    last_invited_at     TIMESTAMPTZ,
    last_responded_at   TIMESTAMPTZ,
    called_no_answer_at TIMESTAMPTZ             -- phoned, didn't pick up (migration 90); status unchanged
);

-- User Settings (per-user app configuration, synced from localStorage; migration 22)
CREATE TABLE IF NOT EXISTS user_settings (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    settings   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Push Subscriptions (Web Push endpoints per user; migration 33)
CREATE TABLE IF NOT EXISTS user_push_subscriptions (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint   TEXT        NOT NULL UNIQUE,
    p256dh     TEXT        NOT NULL,
    auth       TEXT        NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Outreach Lists (external outcome survey lists, e.g. Action 11 from IRIS; migration 61)
CREATE TABLE IF NOT EXISTS outreach_lists (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Outreach Contacts (people on external outreach lists; migrations 61, 90, 92)
CREATE TABLE IF NOT EXISTS outreach_contacts (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    list_id             UUID        NOT NULL REFERENCES outreach_lists(id) ON DELETE CASCADE,
    first_name          TEXT        NOT NULL DEFAULT '',
    last_name           TEXT        NOT NULL DEFAULT '',
    email               TEXT        NOT NULL,
    phone               TEXT,
    external_ref        TEXT,                   -- e.g. IRIS participant ID
    notes               TEXT,
    status              TEXT        NOT NULL DEFAULT 'not_contacted'
                                    CHECK (status IN ('not_contacted', 'pending', 'responded')),
    is_working          BOOLEAN,
    started_month       TEXT,                   -- 'YYYY-MM' format
    field_of_work       TEXT,
    employment_type     TEXT        CONSTRAINT outreach_contacts_employment_type_check
                                    CHECK (employment_type IN ('full_time', 'part_time', 'self_employed', 'ce_tus')), -- migration 92
    last_invited_at     TIMESTAMPTZ,
    last_responded_at   TIMESTAMPTZ,
    called_no_answer_at TIMESTAMPTZ,            -- phoned, didn't pick up (migration 90)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email Opt-Outs (global unsubscribe list keyed by normalized email; migration 62)
CREATE TABLE IF NOT EXISTS email_opt_outs (
    email        TEXT        PRIMARY KEY CHECK (email = lower(trim(email)) AND email <> ''),
    note         TEXT,
    opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID        DEFAULT auth.uid()
);

-- Document Templates (.docx templates for letter generation; migrations 12, 93)
CREATE TABLE IF NOT EXISTS document_templates (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT        NOT NULL,
    display_name TEXT,                           -- optional friendly label (migration 93)
    description  TEXT        NOT NULL DEFAULT '', -- migration 93
    storage_path TEXT        NOT NULL,
    is_active    BOOLEAN     DEFAULT true,       -- multi-template support (migration 12)
    sort_order   INTEGER     NOT NULL DEFAULT 0, -- migration 93
    tags         TEXT[]      NOT NULL DEFAULT '{}', -- extracted {placeholders} (migration 93)
    size_bytes   INTEGER,                        -- migration 93
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Attendance Templates (singleton .docx template for the attendance register; migrations 07, 93)
CREATE TABLE IF NOT EXISTS attendance_templates (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT        NOT NULL,
    storage_path TEXT        NOT NULL,
    tags         TEXT[]      NOT NULL DEFAULT '{}', -- migration 93
    size_bytes   INTEGER,                           -- migration 93
    singleton    BOOLEAN     NOT NULL DEFAULT true, -- migration 93
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT attendance_templates_singleton_check CHECK (singleton),
    CONSTRAINT attendance_templates_singleton_key UNIQUE (singleton)
);

-- Label Templates (singleton .docx template for address label stickers; migrations 14, 93)
CREATE TABLE IF NOT EXISTS label_templates (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT        NOT NULL,
    storage_path TEXT        NOT NULL,
    tags         TEXT[]      NOT NULL DEFAULT '{}', -- migration 93
    size_bytes   INTEGER,                           -- migration 93
    singleton    BOOLEAN     NOT NULL DEFAULT true, -- migration 93
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT label_templates_singleton_check CHECK (singleton),
    CONSTRAINT label_templates_singleton_key UNIQUE (singleton)
);

-- SICAP Templates (singleton .docx template for SICAP forms; migrations 91, 93)
CREATE TABLE IF NOT EXISTS sicap_templates (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    storage_path TEXT        NOT NULL,
    tags         TEXT[]      NOT NULL DEFAULT '{}', -- migration 93
    size_bytes   INTEGER,                           -- migration 93
    singleton    BOOLEAN     NOT NULL DEFAULT true, -- migration 93
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT sicap_templates_singleton_check CHECK (singleton),
    CONSTRAINT sicap_templates_singleton_key UNIQUE (singleton)
);

-- Template Variables (custom placeholders, e.g. {Tutor} or date rules; migrations 13, 74, 93)
CREATE TABLE IF NOT EXISTS template_variables (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    var_key    TEXT        NOT NULL UNIQUE,
    var_value  TEXT        NOT NULL DEFAULT '',
    kind       TEXT        NOT NULL DEFAULT 'text', -- 'text' | 'date' (migration 74)
    date_rule  JSONB,                               -- date variables: { base, amount, unit, format }
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- migration 93
    CONSTRAINT template_variables_kind_check CHECK (
        kind = 'text'
        -- COALESCE: a missing rule makes the checks NULL, which CHECK would let through
        OR COALESCE(
            kind = 'date'
            AND jsonb_typeof(date_rule) = 'object'
            AND date_rule ->> 'base' IN ('courseDate', 'completedAt', 'today')
            AND date_rule ->> 'unit' IN ('days', 'months', 'years')
            AND jsonb_typeof(date_rule -> 'amount') = 'number',
            false
        )
    )
);

-- Document Settings (one shared row: columns of Participants.xlsx; migration 73)
CREATE TABLE IF NOT EXISTS document_settings (
    id            BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
    excel_columns JSONB,      -- [{ header, placeholder }]; NULL = not set yet
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document Generations (audit history of generated document packs; migration 93)
CREATE TABLE IF NOT EXISTS document_generations (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID        DEFAULT auth.uid(),
    staff_name        TEXT        NOT NULL DEFAULT '',
    course_id         UUID        REFERENCES courses(id) ON DELETE SET NULL,
    course_name       TEXT        NOT NULL DEFAULT '',
    session_date      TEXT,
    status            TEXT        NOT NULL DEFAULT 'confirmed'
                                  CHECK (status IN ('confirmed', 'completed', 'mixed')),
    participant_count INTEGER     NOT NULL DEFAULT 0 CHECK (participant_count >= 0),
    template_names    TEXT[]      NOT NULL DEFAULT '{}',
    extras            TEXT[]      NOT NULL DEFAULT '{}',
    file_name         TEXT        NOT NULL DEFAULT '',
    total_docs        INTEGER     NOT NULL DEFAULT 0 CHECK (total_docs >= 0),
    had_problems      BOOLEAN     NOT NULL DEFAULT false,
    source            TEXT        NOT NULL DEFAULT 'documents'
                                  CHECK (source IN ('documents', 'board'))
);

-- PDF Form Templates (fillable PDF form layouts; migration 75)
CREATE TABLE IF NOT EXISTS pdf_form_templates (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT        NOT NULL CHECK (length(trim(name)) > 0),
    description    TEXT,
    pdf_path       TEXT        NOT NULL, -- object path in the "pdf-forms" bucket
    pdf_name       TEXT        NOT NULL, -- uploaded file name
    revision       INT         NOT NULL DEFAULT 1,
    fields         JSONB       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
    column_aliases JSONB       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(column_aliases) = 'object'),
    settings       JSONB       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
    created_by     UUID        DEFAULT auth.uid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cheque Requisitions (SICAP cheque requisition history & supplier memory; migrations 88, 95)
CREATE TABLE IF NOT EXISTS cheque_requisitions (
    id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_name  TEXT           NOT NULL DEFAULT '',
    invoice_number TEXT,
    invoice_date   DATE,
    amount         NUMERIC(12, 2), -- payment amount (what the cheque is for)
    net_amount     NUMERIC(12, 2), -- excluding VAT, for annual single-quotation limit
    status         TEXT           NOT NULL DEFAULT 'ready'
                                  CHECK (status IN ('draft', 'ready', 'paid')), -- migration 95
    cheque_number  TEXT           NOT NULL DEFAULT '', -- cheque / EFT reference (migration 95)
    notes          TEXT           NOT NULL DEFAULT '', -- internal CRM note (migration 95)
    form           JSONB          NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(form) = 'object'),
    meta           JSONB          NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(meta) = 'object'),
    created_by     UUID           DEFAULT auth.uid(),
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Certificate Templates (.docx templates for /certificates; migration 89)
CREATE TABLE IF NOT EXISTS certificate_templates (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    file_name       TEXT        NOT NULL,
    storage_path    TEXT        NOT NULL UNIQUE, -- object path in the "certificate-templates" bucket
    tags            TEXT[]      NOT NULL DEFAULT '{}',
    validity_months INT         CHECK (validity_months BETWEEN 1 AND 600),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    sort_order      INT         NOT NULL DEFAULT 0,
    size_bytes      INT,
    created_by      UUID        DEFAULT auth.uid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin Todos (shared internal task list for admins; migration 96)
CREATE TABLE IF NOT EXISTS admin_todos (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT        NOT NULL CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 300),
    description  TEXT        NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
    category     TEXT        NOT NULL DEFAULT 'general'
                             CHECK (category IN ('general', 'booking', 'course', 'student', 'finance', 'note')),
    status       TEXT        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'in_progress', 'done')),
    priority     TEXT        NOT NULL DEFAULT 'normal'
                             CHECK (priority IN ('normal', 'high', 'urgent')),
    is_pinned    BOOLEAN     NOT NULL DEFAULT false,
    due_date     DATE,
    course_id    UUID        REFERENCES courses(id) ON DELETE SET NULL,
    course_date  DATE,
    student_id   UUID        REFERENCES students(id) ON DELETE SET NULL,
    checklist    JSONB       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checklist) = 'array'),
    assignee_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by   UUID        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin Todo Comments (discussion thread on admin_todos; migration 96)
CREATE TABLE IF NOT EXISTS admin_todo_comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    todo_id    UUID        NOT NULL REFERENCES admin_todos(id) ON DELETE CASCADE,
    body       TEXT        NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 2000),
    created_by UUID        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Log (immutable admin activity log written by SECURITY DEFINER triggers/RPCs; migration 100)
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id    UUID        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    action      TEXT        NOT NULL,
    entity_type TEXT        NOT NULL,
    entity_id   TEXT,
    summary     TEXT        NOT NULL,
    details     JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Students
CREATE INDEX IF NOT EXISTS idx_students_email              ON students(email);
CREATE INDEX IF NOT EXISTS idx_students_email_normalized   ON students (lower(trim(email))); -- migration 99
CREATE INDEX IF NOT EXISTS idx_students_phone              ON students(phone);
CREATE INDEX IF NOT EXISTS idx_students_normalized_eircode ON students(normalized_eircode); -- migration 28
CREATE INDEX IF NOT EXISTS idx_students_created_at         ON students (created_at DESC);    -- migration 44
CREATE INDEX IF NOT EXISTS idx_students_updated_at         ON students (updated_at);         -- migration 99

-- Courses
CREATE INDEX IF NOT EXISTS idx_courses_name                ON courses(name);
CREATE INDEX IF NOT EXISTS idx_courses_active              ON courses (name) WHERE archived_at IS NULL; -- migration 100
CREATE INDEX IF NOT EXISTS idx_courses_updated_at          ON courses (updated_at);          -- migration 99

-- Enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id      ON enrollments(student_id);       -- migration 10
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id       ON enrollments(course_id);        -- migration 10
CREATE INDEX IF NOT EXISTS idx_enrollments_status          ON enrollments(status);           -- migration 44
CREATE INDEX IF NOT EXISTS idx_enrollments_created_at      ON enrollments (created_at DESC); -- migration 44
CREATE INDEX IF NOT EXISTS idx_enrollments_updated_at      ON enrollments (updated_at);      -- migration 84
CREATE INDEX IF NOT EXISTS idx_enrollments_course_status   ON enrollments (course_id, status); -- migration 44
CREATE INDEX IF NOT EXISTS idx_enrollments_course_confirmed_date
    ON enrollments (course_id, confirmed_date)
    WHERE status IN ('confirmed', 'completed'); -- migration 57
CREATE INDEX IF NOT EXISTS idx_enrollments_completion_pending
    ON enrollments (completion_request_status)
    WHERE completion_request_status = 'pending'; -- migration 41
CREATE INDEX IF NOT EXISTS idx_enrollments_queue_requested
    ON enrollments (course_id, is_priority DESC, created_at ASC, id ASC)
    WHERE status = 'requested'; -- migration 99

-- Confirmation tokens
CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_expires     ON confirmation_tokens(expires_at); -- migration 05
CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_course_date ON confirmation_tokens (course_id, course_date); -- migration 99

-- Student flags & non-duplicates
CREATE INDEX IF NOT EXISTS idx_student_flags_student       ON student_flags(student_id); -- migration 17
CREATE INDEX IF NOT EXISTS idx_student_flags_course_id     ON student_flags(course_id);  -- migration 99
CREATE INDEX IF NOT EXISTS idx_student_non_duplicates_a    ON student_non_duplicates(student_a_id); -- migration 24
CREATE INDEX IF NOT EXISTS idx_student_non_duplicates_b    ON student_non_duplicates(student_b_id); -- migration 24

-- Employment status & outreach
CREATE INDEX IF NOT EXISTS idx_employment_status_student   ON employment_status(student_id); -- migration 15
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_contacts_list_email
    ON outreach_contacts (list_id, lower(trim(email))); -- migration 61

-- Push subscriptions
CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_id ON user_push_subscriptions(user_id); -- migration 33

-- Documents, templates & certificates
CREATE INDEX IF NOT EXISTS idx_document_templates_order    ON document_templates (sort_order, created_at); -- migration 93
CREATE INDEX IF NOT EXISTS idx_document_generations_recent ON document_generations (created_at DESC); -- migration 93
CREATE INDEX IF NOT EXISTS idx_document_generations_course_date
    ON document_generations (course_id, session_date, created_at DESC); -- migration 93
CREATE INDEX IF NOT EXISTS idx_certificate_templates_order ON certificate_templates (sort_order, name); -- migration 89

-- Cheque requisitions
CREATE INDEX IF NOT EXISTS idx_cheque_requisitions_created_at   ON cheque_requisitions (created_at DESC); -- migration 88
CREATE INDEX IF NOT EXISTS idx_cheque_requisitions_status       ON cheque_requisitions (status); -- migration 95
CREATE INDEX IF NOT EXISTS idx_cheque_requisitions_invoice_date ON cheque_requisitions (invoice_date DESC NULLS LAST); -- migration 95

-- Admin todos
CREATE INDEX IF NOT EXISTS idx_admin_todos_active_order
    ON admin_todos (status, is_pinned DESC, due_date ASC NULLS LAST, created_at DESC); -- migration 96
CREATE INDEX IF NOT EXISTS idx_admin_todos_assignee ON admin_todos (assignee_id) WHERE assignee_id IS NOT NULL; -- migration 96
CREATE INDEX IF NOT EXISTS idx_admin_todos_course   ON admin_todos (course_id)   WHERE course_id IS NOT NULL;   -- migration 96
CREATE INDEX IF NOT EXISTS idx_admin_todos_student  ON admin_todos (student_id)  WHERE student_id IS NOT NULL;  -- migration 96
CREATE INDEX IF NOT EXISTS idx_admin_todo_comments_todo_created ON admin_todo_comments (todo_id, created_at ASC); -- migration 96

-- Audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at        ON audit_log (created_at DESC); -- migration 100
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at ON audit_log (action, created_at DESC); -- migration 100
CREATE INDEX IF NOT EXISTS idx_audit_log_entity            ON audit_log (entity_type, entity_id); -- migration 100

-- ============================================================
-- ROW LEVEL SECURITY
-- (Role-restricted and admin-only policies using is_app_admin()
--  are created and tightened by the numbered migrations.)
-- ============================================================

ALTER TABLE students                ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_dates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmation_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_flags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_non_duplicates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_status       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_lists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_opt_outs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sicap_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_variables      ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_generations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_form_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheque_requisitions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificate_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_todos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_todo_comments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;

-- Baseline policies for core tables (tightened by migrations 56, 58, 65, 83, 93, 98)
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

-- Policies for student_non_duplicates (24), user_push_subscriptions (33),
-- outreach_lists / outreach_contacts (61, 65), email_opt_outs (62),
-- document_settings (73, 93), pdf_form_templates (75), cheque_requisitions (88),
-- certificate_templates (89), sicap_templates (91, 93), document_generations (93),
-- admin_todos / admin_todo_comments (96), and audit_log (100) are applied by
-- their respective numbered migrations.

-- ============================================================
-- TRIGGERS
-- (Additional triggers — student normalization, duplicate-enrollment
--  guard, push notifications, audit logging, and updated_at touch
--  triggers on feature tables — are applied via numbered migrations.)
-- ============================================================

-- Auto-update updated_at on enrollments, students, and courses
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

DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Deleting a document template drops it from course presets (migration 73)
CREATE OR REPLACE FUNCTION remove_template_from_course_presets()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.courses
       SET template_ids = array_remove(template_ids, OLD.id)
     WHERE OLD.id = ANY (template_ids);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_remove_template_from_course_presets ON document_templates;
CREATE TRIGGER trg_remove_template_from_course_presets
    AFTER DELETE ON document_templates
    FOR EACH ROW EXECUTE FUNCTION remove_template_from_course_presets();

-- ============================================================
-- FUNCTIONS (RPCs)
-- (Baseline definitions retained for fresh-install compatibility with
--  early migrations; subsequent numbered migrations 01–101 supersede
--  these definitions, drop bulk_update_registration_dates in migration
--  78, and add all newer admin/viewer/outreach/audit RPCs.)
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

    INSERT INTO employment_status (student_id, email, is_working, started_month, field_of_work, employment_type, status, last_responded_at, called_no_answer_at)
    VALUES (v_student_id, v_student_email, p_is_working, p_started_month, p_field, p_employment_type, 'responded', p_responded_at, NULL)
    ON CONFLICT (student_id)
    DO UPDATE SET
        email               = EXCLUDED.email,
        is_working          = EXCLUDED.is_working,
        started_month       = EXCLUDED.started_month,
        field_of_work       = EXCLUDED.field_of_work,
        employment_type     = EXCLUDED.employment_type,
        status              = 'responded',
        last_responded_at   = EXCLUDED.last_responded_at,
        called_no_answer_at = NULL;

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
-- (Applied by numbered migrations 06, 16, 21, 61, 93, 95, 96, 99,
--  or via Supabase Dashboard → Database → Replication)
-- ============================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE enrollments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE students;
-- ALTER PUBLICATION supabase_realtime ADD TABLE courses;
-- ALTER PUBLICATION supabase_realtime ADD TABLE student_flags;
-- ALTER PUBLICATION supabase_realtime ADD TABLE employment_status;
-- ALTER PUBLICATION supabase_realtime ADD TABLE outreach_lists;
-- ALTER PUBLICATION supabase_realtime ADD TABLE outreach_contacts;
-- ALTER PUBLICATION supabase_realtime ADD TABLE document_templates;
-- ALTER PUBLICATION supabase_realtime ADD TABLE attendance_templates;
-- ALTER PUBLICATION supabase_realtime ADD TABLE label_templates;
-- ALTER PUBLICATION supabase_realtime ADD TABLE sicap_templates;
-- ALTER PUBLICATION supabase_realtime ADD TABLE template_variables;
-- ALTER PUBLICATION supabase_realtime ADD TABLE document_settings;
-- ALTER PUBLICATION supabase_realtime ADD TABLE document_generations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE cheque_requisitions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE admin_todos;
-- ALTER PUBLICATION supabase_realtime ADD TABLE admin_todo_comments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE invite_dates;
-- ALTER PUBLICATION supabase_realtime ADD TABLE email_opt_outs;
-- ALTER PUBLICATION supabase_realtime ADD TABLE pdf_form_templates;
-- ALTER PUBLICATION supabase_realtime ADD TABLE certificate_templates;
