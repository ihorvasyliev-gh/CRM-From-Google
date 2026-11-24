-- ============================================================
-- Migration 99: Merge Integrity, Duplicate Trigger & Undo,
--               Missing Indexes, Viewer RPCs & Realtime
--
-- 1. merge_students_unchecked():
--      * Reassigns admin_todos.student_id before deleting the
--        duplicate student (FK is ON DELETE SET NULL).
--      * Preserves enrollments.invited_dates,
--        enrollments.exclude_from_reports,
--        enrollments.confirmed_push_sent_at, and
--        employment_status.called_no_answer_at.
--      * Respects migration 81 per-language "requested" queues:
--        two "requested" enrollments on the same course with
--        different course_variant_key() are both kept.
-- 2. prevent_duplicate_course_enrollment() & trigger:
--      * Upgraded from BEFORE INSERT to BEFORE INSERT OR UPDATE
--        OF student_id, course_id, status, course_variant.
--      * Serializes concurrent writes per (student_id, course_id)
--        via pg_advisory_xact_lock().
--      * restore_enrollments() enables crm.restoring_enrollments
--        for both its UPDATE and INSERT steps so Undo is never
--        blocked by the trigger.
-- 3. Missing performance indexes on students, courses,
--    student_flags, enrollments (requested queue), and
--    confirmation_tokens.
-- 4. Optimized Viewer RPCs (get_viewer_students_directory,
--    get_viewer_course_roster):
--      * Single ROW_NUMBER() window CTE for queue positions
--        instead of per-row get_enrollment_queue_position().
--      * Pre-aggregated CTEs replacing correlated subqueries.
--      * p_limit capped at 200; ILIKE wildcards (%, _, \) escaped.
-- 5. Add invite_dates, email_opt_outs, pdf_form_templates, and
--    certificate_templates to supabase_realtime publication.
-- 6. Deterministic ORDER BY on get_outcome_graduates() for safe
--    .range() pagination.
--
-- Safe to run more than once (idempotent).
-- This file creates no tables: if the RLS warning appears,
-- choose "Run without RLS".
-- ============================================================

-- ------------------------------------------------------------
-- 1. Hardened merge_students_unchecked()
--    Preserves exact signature called by merge_students() and
--    merge_students_with_changes().
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_students_unchecked(p_primary_id UUID, p_duplicate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_primary students%ROWTYPE;
    v_duplicate students%ROWTYPE;

    v_enrollment RECORD;
    v_course_name TEXT;
    v_dup_variant_key TEXT;
    v_existing_id UUID;
    v_existing_status TEXT;
    v_dup_rank INT;
    v_existing_rank INT;

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
    v_prim_called_no_answer TIMESTAMPTZ;

    v_dup_emp_id UUID;
    v_dup_emp_status TEXT;
    v_dup_working BOOLEAN;
    v_dup_started TEXT;
    v_dup_field TEXT;
    v_dup_type TEXT;
    v_dup_invited TIMESTAMPTZ;
    v_dup_responded TIMESTAMPTZ;
    v_dup_called_no_answer TIMESTAMPTZ;
BEGIN
    IF p_primary_id = p_duplicate_id THEN
        RAISE EXCEPTION 'Cannot merge a student into themselves.';
    END IF;

    -- Lock both student rows in deterministic order to prevent deadlocks
    IF p_primary_id < p_duplicate_id THEN
        PERFORM id FROM public.students WHERE id = p_primary_id FOR UPDATE;
        PERFORM id FROM public.students WHERE id = p_duplicate_id FOR UPDATE;
    ELSE
        PERFORM id FROM public.students WHERE id = p_duplicate_id FOR UPDATE;
        PERFORM id FROM public.students WHERE id = p_primary_id FOR UPDATE;
    END IF;

    -- 1. Fetch details of both students
    SELECT * INTO v_primary FROM public.students WHERE id = p_primary_id;
    SELECT * INTO v_duplicate FROM public.students WHERE id = p_duplicate_id;

    IF v_primary.id IS NULL THEN
        RAISE EXCEPTION 'Primary student with ID % not found.', p_primary_id;
    END IF;
    IF v_duplicate.id IS NULL THEN
        RAISE EXCEPTION 'Duplicate student with ID % not found.', p_duplicate_id;
    END IF;

    -- 2. Consolidate Enrollments (respecting per-language requested queues from migration 81)
    FOR v_enrollment IN
        SELECT * FROM public.enrollments
        WHERE student_id = p_duplicate_id
        ORDER BY
            CASE status
                WHEN 'completed' THEN 1
                WHEN 'confirmed' THEN 2
                WHEN 'invited'   THEN 3
                WHEN 'requested' THEN 4
                ELSE 5
            END,
            created_at ASC
    LOOP
        SELECT name INTO v_course_name
        FROM public.courses
        WHERE id = v_enrollment.course_id;

        v_dup_variant_key := public.course_variant_key(v_course_name, v_enrollment.course_variant);
        v_existing_id := NULL;
        v_existing_status := NULL;

        -- Only deduplicate when same course_id AND either:
        --   * at least one side is not 'requested' (non-requested active/terminal row), OR
        --   * both map to the same language via course_variant_key(), OR
        --   * exact same course_variant string (protects UNIQUE(student_id, course_id, course_variant)).
        -- Two 'requested' enrollments with DIFFERENT language keys stay separate.
        SELECT id, status INTO v_existing_id, v_existing_status
        FROM public.enrollments
        WHERE student_id = p_primary_id
          AND course_id = v_enrollment.course_id
          AND (
              v_enrollment.status IS DISTINCT FROM 'requested'
              OR status NOT IN ('requested', 'withdrawn', 'rejected')
              OR public.course_variant_key(v_course_name, course_variant) = v_dup_variant_key
              OR COALESCE(course_variant, '') = COALESCE(v_enrollment.course_variant, '')
          )
        ORDER BY
            (CASE WHEN public.course_variant_key(v_course_name, course_variant) = v_dup_variant_key THEN 0 ELSE 1 END),
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
            v_dup_rank := CASE v_enrollment.status
                WHEN 'completed' THEN 1
                WHEN 'confirmed' THEN 2
                WHEN 'invited'   THEN 3
                WHEN 'requested' THEN 4
                ELSE 5
            END;
            v_existing_rank := CASE v_existing_status
                WHEN 'completed' THEN 1
                WHEN 'confirmed' THEN 2
                WHEN 'invited'   THEN 3
                WHEN 'requested' THEN 4
                ELSE 5
            END;

            UPDATE public.enrollments
            SET
                status = CASE
                    WHEN v_dup_rank < v_existing_rank THEN v_enrollment.status
                    ELSE status
                END,
                created_at = LEAST(created_at, v_enrollment.created_at),
                is_priority = (COALESCE(is_priority, false) OR COALESCE(v_enrollment.is_priority, false)),
                exclude_from_reports = (COALESCE(exclude_from_reports, false) OR COALESCE(v_enrollment.exclude_from_reports, false)),
                invited_date = COALESCE(invited_date, v_enrollment.invited_date),
                invited_dates = CASE
                    WHEN invited_dates IS NOT NULL AND v_enrollment.invited_dates IS NOT NULL THEN
                        (SELECT array_agg(DISTINCT d ORDER BY d) FROM unnest(invited_dates || v_enrollment.invited_dates) AS d)
                    ELSE COALESCE(invited_dates, v_enrollment.invited_dates)
                END,
                confirmed_date = COALESCE(confirmed_date, v_enrollment.confirmed_date),
                completed_date = COALESCE(completed_date, v_enrollment.completed_date),
                invited_at = COALESCE(invited_at, v_enrollment.invited_at),
                confirmed_at = COALESCE(confirmed_at, v_enrollment.confirmed_at),
                completed_at = COALESCE(completed_at, v_enrollment.completed_at),
                confirmed_push_sent_at = COALESCE(confirmed_push_sent_at, v_enrollment.confirmed_push_sent_at),
                response_days = COALESCE(response_days, v_enrollment.response_days),
                course_variant = CASE
                    WHEN v_dup_rank < v_existing_rank AND NULLIF(TRIM(v_enrollment.course_variant), '') IS NOT NULL
                        THEN v_enrollment.course_variant
                    ELSE COALESCE(NULLIF(TRIM(course_variant), ''), v_enrollment.course_variant)
                END,
                notes = CASE
                    WHEN notes IS NOT NULL AND v_enrollment.notes IS NOT NULL AND TRIM(notes) <> '' AND TRIM(v_enrollment.notes) <> '' AND notes <> v_enrollment.notes
                        THEN TRIM(notes || ' | ' || v_enrollment.notes)
                    ELSE COALESCE(NULLIF(TRIM(notes), ''), v_enrollment.notes)
                END,
                updated_at = now()
            WHERE id = v_existing_id;

            DELETE FROM public.enrollments WHERE id = v_enrollment.id;
        ELSE
            UPDATE public.enrollments
            SET student_id = p_primary_id,
                updated_at = now()
            WHERE id = v_enrollment.id;
        END IF;
    END LOOP;

    -- 3. Consolidate Student Flags
    FOR v_flag IN SELECT * FROM public.student_flags WHERE student_id = p_duplicate_id LOOP
        v_existing_flag_id := NULL;
        v_existing_flag_comment := NULL;

        SELECT id, comment INTO v_existing_flag_id, v_existing_flag_comment
        FROM public.student_flags
        WHERE student_id = p_primary_id AND course_id = v_flag.course_id
        LIMIT 1;

        IF v_existing_flag_id IS NOT NULL THEN
            UPDATE public.student_flags
            SET comment = CASE
                WHEN v_flag.comment IS NOT NULL AND v_existing_flag_comment IS NOT NULL AND v_flag.comment <> v_existing_flag_comment
                    THEN v_existing_flag_comment || '; ' || v_flag.comment
                ELSE COALESCE(v_existing_flag_comment, v_flag.comment)
            END
            WHERE id = v_existing_flag_id;

            DELETE FROM public.student_flags WHERE id = v_flag.id;
        ELSE
            UPDATE public.student_flags SET student_id = p_primary_id WHERE id = v_flag.id;
        END IF;
    END LOOP;

    -- 4. Consolidate Employment Status (preserving called_no_answer_at)
    SELECT id, status, is_working, started_month, field_of_work, employment_type, last_invited_at, last_responded_at, called_no_answer_at
    INTO v_prim_emp_id, v_prim_emp_status, v_prim_working, v_prim_started, v_prim_field, v_prim_type, v_prim_invited, v_prim_responded, v_prim_called_no_answer
    FROM public.employment_status
    WHERE student_id = p_primary_id;

    SELECT id, status, is_working, started_month, field_of_work, employment_type, last_invited_at, last_responded_at, called_no_answer_at
    INTO v_dup_emp_id, v_dup_emp_status, v_dup_working, v_dup_started, v_dup_field, v_dup_type, v_dup_invited, v_dup_responded, v_dup_called_no_answer
    FROM public.employment_status
    WHERE student_id = p_duplicate_id;

    IF v_prim_emp_id IS NOT NULL AND v_dup_emp_id IS NOT NULL THEN
        IF v_dup_emp_status = 'responded' AND v_prim_emp_status <> 'responded' THEN
            UPDATE public.employment_status
            SET is_working = v_dup_working,
                started_month = v_dup_started,
                field_of_work = v_dup_field,
                employment_type = v_dup_type,
                status = 'responded',
                last_invited_at = COALESCE(last_invited_at, v_dup_invited),
                last_responded_at = v_dup_responded,
                called_no_answer_at = GREATEST(called_no_answer_at, v_dup_called_no_answer)
            WHERE id = v_prim_emp_id;
        ELSE
            UPDATE public.employment_status
            SET last_invited_at = COALESCE(last_invited_at, v_dup_invited),
                last_responded_at = COALESCE(last_responded_at, v_dup_responded),
                called_no_answer_at = GREATEST(called_no_answer_at, v_dup_called_no_answer)
            WHERE id = v_prim_emp_id;
        END IF;

        DELETE FROM public.employment_status WHERE id = v_dup_emp_id;
    ELSIF v_dup_emp_id IS NOT NULL THEN
        UPDATE public.employment_status SET student_id = p_primary_id WHERE id = v_dup_emp_id;
    END IF;

    -- 5. Reassign Admin To-Do links before deleting duplicate student
    --    (admin_todos.student_id is ON DELETE SET NULL, so reassigning first keeps the link)
    IF to_regclass('public.admin_todos') IS NOT NULL THEN
        UPDATE public.admin_todos
        SET student_id = p_primary_id
        WHERE student_id = p_duplicate_id;
    END IF;

    -- 6. Delete Duplicate Student Profile
    DELETE FROM public.students WHERE id = p_duplicate_id;

    -- 7. Clean up any student_non_duplicates records pointing to deleted duplicate
    DELETE FROM public.student_non_duplicates WHERE student_a_id = p_duplicate_id OR student_b_id = p_duplicate_id;

    -- 8. Enrich Primary Student Info (ONLY fill missing / NULL fields; NEVER overwrite chosen names)
    UPDATE public.students
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

REVOKE EXECUTE ON FUNCTION public.merge_students_unchecked(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Duplicate enrollment trigger on INSERT + UPDATE with
--    advisory lock, plus Undo-safe restore_enrollments()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_duplicate_course_enrollment()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id     UUID;
    v_course_name     TEXT;
    v_entering_active BOOLEAN;
BEGIN
    -- Set only inside restore_enrollments(): rows put back exactly as they were
    IF current_setting('crm.restoring_enrollments', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- Withdrawn and rejected rows are inactive and never count as active duplicates
    IF NEW.status IN ('withdrawn', 'rejected') THEN
        RETURN NEW;
    END IF;

    -- Serialize concurrent inserts/updates for the same (student_id, course_id)
    PERFORM pg_advisory_xact_lock(hashtext(NEW.student_id::text || ':' || NEW.course_id::text));

    SELECT name INTO v_course_name FROM public.courses WHERE id = NEW.course_id;

    IF TG_OP = 'INSERT' THEN
        -- Another language may join while the student's active enrollments on the course are all
        -- still queued; the same language, or anything once one of them has moved on, is skipped
        SELECT id INTO v_existing_id
        FROM public.enrollments
        WHERE student_id = NEW.student_id
          AND course_id = NEW.course_id
          AND status NOT IN ('withdrawn', 'rejected')
          AND (
              status <> 'requested'
              OR NEW.status IS DISTINCT FROM 'requested'
              OR public.course_variant_key(v_course_name, course_variant) = public.course_variant_key(v_course_name, NEW.course_variant)
          )
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            -- Silently skip inserting duplicate active enrollment
            RETURN NULL;
        END IF;
    ELSE
        -- TG_OP = 'UPDATE': ignore self (id <> NEW.id).
        -- Always block two active enrollments in the same language. When a row newly enters
        -- the active set for (student_id, course_id) (reassigned or re-activated from
        -- withdrawn/rejected), also block if another non-requested active row exists or if
        -- this row is non-requested alongside another active row.
        v_entering_active := (NEW.student_id IS DISTINCT FROM OLD.student_id)
                          OR (NEW.course_id IS DISTINCT FROM OLD.course_id)
                          OR (OLD.status IN ('withdrawn', 'rejected'));

        SELECT id INTO v_existing_id
        FROM public.enrollments
        WHERE student_id = NEW.student_id
          AND course_id = NEW.course_id
          AND id <> NEW.id
          AND status NOT IN ('withdrawn', 'rejected')
          AND (
              public.course_variant_key(v_course_name, course_variant) = public.course_variant_key(v_course_name, NEW.course_variant)
              OR (
                  v_entering_active
                  AND (status <> 'requested' OR NEW.status IS DISTINCT FROM 'requested')
              )
          )
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            RAISE EXCEPTION 'Student already has an active enrollment for this course and language'
                USING ERRCODE = '23505';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_course_enrollment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_course_enrollment ON public.enrollments;
CREATE TRIGGER trg_prevent_duplicate_course_enrollment
    BEFORE INSERT OR UPDATE OF student_id, course_id, status, course_variant ON public.enrollments
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_duplicate_course_enrollment();

-- Ensure Undo (restore_enrollments) sets crm.restoring_enrollments = 'on' for BOTH
-- UPDATE and INSERT so restoring withdrawn multi-language rows never trips the UPDATE trigger
CREATE OR REPLACE FUNCTION public.restore_enrollments(
    p_rows    JSONB,
    p_removed JSONB DEFAULT '[]'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_rows    JSONB := COALESCE(p_rows, '[]'::jsonb);
    v_removed JSONB := COALESCE(p_removed, '[]'::jsonb);
    v_count   INT;
BEGIN
    PERFORM set_config('crm.restoring_enrollments', 'on', true);

    UPDATE public.enrollments e SET
        status         = s.status,
        confirmed_date = s.confirmed_date,
        confirmed_at   = s.confirmed_at,
        invited_date   = s.invited_date,
        invited_dates  = s.invited_dates,
        invited_at     = s.invited_at,
        completed_date = s.completed_date,
        completed_at   = s.completed_at
    FROM jsonb_to_recordset(v_rows) AS s(
        id UUID, status TEXT, confirmed_date DATE, confirmed_at TIMESTAMPTZ, invited_date DATE,
        invited_dates DATE[], invited_at TIMESTAMPTZ, completed_date DATE, completed_at TIMESTAMPTZ
    )
    WHERE e.id = s.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count < jsonb_array_length(v_rows) THEN
        PERFORM set_config('crm.restoring_enrollments', 'off', true);
        RAISE EXCEPTION 'Some enrollments were not found: deleted meanwhile, or not yours to change'
            USING ERRCODE = 'P0002';
    END IF;

    IF jsonb_array_length(v_removed) > 0 THEN
        INSERT INTO public.enrollments
        SELECT * FROM jsonb_populate_recordset(NULL::public.enrollments, v_removed)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    PERFORM set_config('crm.restoring_enrollments', 'off', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_enrollments(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_enrollments(JSONB, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 3. Missing Performance Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_email_normalized
    ON public.students (lower(trim(email)));

CREATE INDEX IF NOT EXISTS idx_students_updated_at
    ON public.students (updated_at);

CREATE INDEX IF NOT EXISTS idx_courses_updated_at
    ON public.courses (updated_at);

CREATE INDEX IF NOT EXISTS idx_student_flags_course_id
    ON public.student_flags (course_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_queue_requested
    ON public.enrollments (course_id, is_priority DESC, created_at ASC, id ASC)
    WHERE status = 'requested';

CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_course_date
    ON public.confirmation_tokens (course_id, course_date);

-- ------------------------------------------------------------
-- 4. Optimized Viewer RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_viewer_course_roster(
    p_course_id UUID,
    p_status TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
    enrollment_id UUID,
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT,
    course_variant TEXT,
    notes TEXT,
    is_priority BOOLEAN,
    queue_position INTEGER,
    invited_date DATE,
    invited_at TIMESTAMPTZ,
    confirmed_date DATE,
    confirmed_at TIMESTAMPTZ,
    completed_date DATE,
    completed_at TIMESTAMPTZ,
    pending_completion_date DATE,
    completion_request_status TEXT,
    completion_requested_at TIMESTAMPTZ,
    completion_requested_by TEXT,
    completion_rejection_reason TEXT,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_escaped_search TEXT;
BEGIN
    IF (SELECT auth.role()) != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_search IS NOT NULL AND trim(p_search) <> '' THEN
        v_escaped_search := replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_');
    END IF;

    RETURN QUERY
    WITH course_info AS (
        SELECT c.name AS course_name
        FROM public.courses c
        WHERE c.id = p_course_id
    ),
    queue_positions AS (
        SELECT
            q.id AS q_enrollment_id,
            ROW_NUMBER() OVER (
                PARTITION BY q.course_id, public.course_variant_key(ci.course_name, q.course_variant)
                ORDER BY COALESCE(q.is_priority, FALSE) DESC, q.created_at ASC, q.id ASC
            )::INTEGER AS q_pos
        FROM public.enrollments q
        LEFT JOIN course_info ci ON TRUE
        WHERE q.course_id = p_course_id
          AND q.status = 'requested'
    )
    SELECT
        e.id AS enrollment_id,
        s.id AS student_id,
        s.first_name,
        s.last_name,
        s.email,
        s.phone,
        e.status,
        e.course_variant,
        e.notes,
        e.is_priority,
        qp.q_pos AS queue_position,
        e.invited_date,
        e.invited_at,
        e.confirmed_date,
        e.confirmed_at,
        e.completed_date,
        e.completed_at,
        e.pending_completion_date,
        COALESCE(e.completion_request_status, 'none') AS completion_request_status,
        e.completion_requested_at,
        e.completion_requested_by,
        e.completion_rejection_reason,
        e.created_at
    FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    LEFT JOIN queue_positions qp ON qp.q_enrollment_id = e.id
    WHERE e.course_id = p_course_id
      AND (p_status IS NULL OR p_status = '' OR p_status = 'all' OR e.status = p_status)
      AND (
          v_escaped_search IS NULL OR
          (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) ILIKE '%' || v_escaped_search || '%' ESCAPE '\' OR
          COALESCE(s.email, '') ILIKE '%' || v_escaped_search || '%' ESCAPE '\' OR
          COALESCE(s.phone, '') ILIKE '%' || v_escaped_search || '%' ESCAPE '\'
      )
    ORDER BY
        CASE
            WHEN e.completion_request_status = 'pending' THEN 0
            WHEN e.status = 'confirmed' THEN 1
            WHEN e.status = 'invited' THEN 2
            WHEN e.status = 'requested' THEN 3
            WHEN e.status = 'completed' THEN 4
            ELSE 5
        END,
        COALESCE(e.is_priority, FALSE) DESC,
        e.created_at ASC,
        s.last_name ASC,
        s.first_name ASC,
        e.id ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_viewer_course_roster(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_viewer_course_roster(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_viewer_students_directory(
    p_search TEXT DEFAULT NULL,
    p_course_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_priority_only BOOLEAN DEFAULT FALSE,
    p_sort_by TEXT DEFAULT 'date_desc',
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    eircode TEXT,
    dob DATE,
    created_at TIMESTAMPTZ,
    primary_course_name TEXT,
    primary_course_id UUID,
    primary_status TEXT,
    primary_course_variant TEXT,
    primary_queue_position INT,
    is_priority BOOLEAN,
    total_enrollments INT,
    notes_count INT,
    total_count BIGINT
) AS $$
DECLARE
    v_clean_search TEXT := trim(p_search);
    v_status TEXT := lower(trim(p_status));
    v_sort_by TEXT := lower(trim(p_sort_by));
    v_limit INT := LEAST(200, GREATEST(1, COALESCE(p_limit, 50)));
    v_offset INT := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
    IF (SELECT auth.role()) != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    WITH search_terms AS (
        SELECT
            replace(replace(replace(raw_term, '\', '\\'), '%', '\%'), '_', '\_') AS escaped_term,
            replace(replace(replace(upper(replace(raw_term, ' ', '')), '\', '\\'), '%', '\%'), '_', '\_') AS escaped_eircode,
            regexp_replace(raw_term, '\D', '', 'g') AS digits
        FROM (
            SELECT trim(t) AS raw_term
            FROM regexp_split_to_table(COALESCE(v_clean_search, ''), '\s+') AS t
            WHERE length(trim(t)) > 0
        ) raw_split
    ),
    filtered_students AS (
        SELECT
            s.id AS f_student_id,
            s.first_name AS f_first_name,
            s.last_name AS f_last_name,
            s.email AS f_email,
            s.phone AS f_phone,
            s.address AS f_address,
            s.eircode AS f_eircode,
            s.dob AS f_dob,
            s.created_at AS f_created_at
        FROM public.students s
        WHERE (
            v_clean_search IS NULL OR v_clean_search = '' OR
            NOT EXISTS (
                SELECT 1
                FROM search_terms st
                WHERE NOT (
                    COALESCE(s.first_name, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\' OR
                    COALESCE(s.last_name, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\' OR
                    (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) ILIKE '%' || st.escaped_term || '%' ESCAPE '\' OR
                    COALESCE(s.email, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\' OR
                    COALESCE(s.address, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\' OR
                    COALESCE(s.normalized_eircode, upper(replace(COALESCE(s.eircode, ''), ' ', ''))) ILIKE '%' || st.escaped_eircode || '%' ESCAPE '\' OR
                    COALESCE(s.phone, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\' OR
                    (
                        length(st.digits) >= 2 AND (
                            regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%' || st.digits || '%'
                            OR (
                                st.digits LIKE '0%' AND
                                regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%' || substr(st.digits, 2) || '%'
                            )
                        )
                    )
                )
            )
        )
        AND (
            (
                p_course_id IS NULL
                AND (v_status IS NULL OR v_status = '' OR v_status = 'all')
                AND NOT COALESCE(p_priority_only, FALSE)
            )
            OR EXISTS (
                SELECT 1
                FROM public.enrollments fe
                WHERE fe.student_id = s.id
                  AND (p_course_id IS NULL OR fe.course_id = p_course_id)
                  AND (v_status IS NULL OR v_status = '' OR v_status = 'all' OR fe.status = v_status)
                  AND (NOT COALESCE(p_priority_only, FALSE) OR fe.is_priority = TRUE)
            )
        )
    ),
    queue_positions AS (
        SELECT
            q.id AS q_enrollment_id,
            ROW_NUMBER() OVER (
                PARTITION BY q.course_id, public.course_variant_key(c.name, q.course_variant)
                ORDER BY COALESCE(q.is_priority, FALSE) DESC, q.created_at ASC, q.id ASC
            )::INT AS q_pos
        FROM public.enrollments q
        LEFT JOIN public.courses c ON c.id = q.course_id
        WHERE q.status = 'requested'
    ),
    primary_enrollments AS (
        SELECT DISTINCT ON (e.student_id)
            e.student_id AS pe_student_id,
            e.id AS enrollment_id,
            e.course_id,
            c.name AS course_name,
            e.status,
            e.course_variant,
            e.is_priority
        FROM public.enrollments e
        JOIN public.courses c ON c.id = e.course_id
        WHERE e.student_id IN (SELECT fs_sub.f_student_id FROM filtered_students fs_sub)
        ORDER BY
            e.student_id,
            CASE WHEN p_course_id IS NOT NULL AND e.course_id = p_course_id THEN 0 ELSE 1 END,
            CASE WHEN v_status IS NOT NULL AND v_status <> '' AND v_status <> 'all' AND e.status = v_status THEN 0 ELSE 1 END,
            CASE WHEN e.is_priority = TRUE THEN 0 ELSE 1 END,
            CASE
                WHEN e.completion_request_status = 'pending' THEN 0
                WHEN e.status = 'confirmed' THEN 1
                WHEN e.status = 'invited' THEN 2
                WHEN e.status = 'requested' THEN 3
                WHEN e.status = 'completed' THEN 4
                ELSE 5
            END,
            e.created_at DESC,
            e.id ASC
    ),
    enrollment_stats AS (
        SELECT
            e.student_id AS es_student_id,
            COUNT(*)::INT AS total_enrollments,
            COUNT(*) FILTER (WHERE e.notes IS NOT NULL AND trim(e.notes) <> '')::INT AS enrollment_notes_count
        FROM public.enrollments e
        WHERE e.student_id IN (SELECT fs_sub.f_student_id FROM filtered_students fs_sub)
        GROUP BY e.student_id
    ),
    flag_stats AS (
        SELECT
            sf.student_id AS fl_student_id,
            COUNT(*)::INT AS flags_count
        FROM public.student_flags sf
        WHERE sf.student_id IN (SELECT fs_sub.f_student_id FROM filtered_students fs_sub)
        GROUP BY sf.student_id
    )
    SELECT
        fs.f_student_id AS student_id,
        fs.f_first_name AS first_name,
        fs.f_last_name AS last_name,
        fs.f_email AS email,
        fs.f_phone AS phone,
        fs.f_address AS address,
        fs.f_eircode AS eircode,
        fs.f_dob AS dob,
        fs.f_created_at AS created_at,
        pe.course_name AS primary_course_name,
        pe.course_id AS primary_course_id,
        pe.status AS primary_status,
        pe.course_variant AS primary_course_variant,
        CASE WHEN pe.status = 'requested' THEN qp.q_pos ELSE NULL END AS primary_queue_position,
        COALESCE(pe.is_priority, FALSE) AS is_priority,
        COALESCE(es.total_enrollments, 0) AS total_enrollments,
        (COALESCE(fls.flags_count, 0) + COALESCE(es.enrollment_notes_count, 0))::INT AS notes_count,
        COUNT(*) OVER()::BIGINT AS total_count
    FROM filtered_students fs
    LEFT JOIN primary_enrollments pe ON pe.pe_student_id = fs.f_student_id
    LEFT JOIN queue_positions qp ON qp.q_enrollment_id = pe.enrollment_id
    LEFT JOIN enrollment_stats es ON es.es_student_id = fs.f_student_id
    LEFT JOIN flag_stats fls ON fls.fl_student_id = fs.f_student_id
    ORDER BY
        CASE
            WHEN v_sort_by = 'date_asc' THEN NULL
            WHEN v_sort_by = 'name_asc' THEN NULL
            WHEN v_sort_by = 'queue' THEN NULL
            ELSE fs.f_created_at
        END DESC NULLS LAST,

        CASE
            WHEN v_sort_by = 'date_asc' THEN fs.f_created_at
            ELSE NULL
        END ASC NULLS LAST,

        CASE
            WHEN v_sort_by = 'name_asc' THEN COALESCE(fs.f_last_name, '')
            ELSE NULL
        END ASC NULLS LAST,
        CASE
            WHEN v_sort_by = 'name_asc' THEN COALESCE(fs.f_first_name, '')
            ELSE NULL
        END ASC NULLS LAST,

        CASE
            WHEN v_sort_by = 'queue' AND COALESCE(pe.is_priority, FALSE) THEN 0
            WHEN v_sort_by = 'queue' THEN 1
            ELSE NULL
        END ASC NULLS LAST,
        CASE
            WHEN v_sort_by = 'queue' AND pe.status = 'requested' THEN 0
            WHEN v_sort_by = 'queue' THEN 1
            ELSE NULL
        END ASC NULLS LAST,
        CASE
            WHEN v_sort_by = 'queue' AND pe.status = 'requested' THEN qp.q_pos
            ELSE NULL
        END ASC NULLS LAST,
        CASE
            WHEN v_sort_by = 'queue' AND pe.status = 'confirmed' THEN 1
            WHEN v_sort_by = 'queue' AND pe.status = 'invited' THEN 2
            WHEN v_sort_by = 'queue' AND pe.status = 'completed' THEN 3
            WHEN v_sort_by = 'queue' THEN 4
            ELSE NULL
        END ASC NULLS LAST,
        CASE
            WHEN v_sort_by = 'queue' THEN fs.f_created_at
            ELSE NULL
        END ASC NULLS LAST,

        fs.f_last_name ASC NULLS LAST,
        fs.f_first_name ASC NULLS LAST,
        fs.f_student_id ASC
    LIMIT v_limit OFFSET v_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_viewer_students_directory(TEXT, UUID, TEXT, BOOLEAN, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_viewer_students_directory(TEXT, UUID, TEXT, BOOLEAN, TEXT, INT, INT) TO authenticated;

-- ------------------------------------------------------------
-- 5. Publish additional live tables to supabase_realtime
-- ------------------------------------------------------------
DO $$
DECLARE
    v_tbl TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH v_tbl IN ARRAY ARRAY['invite_dates', 'email_opt_outs', 'pdf_form_templates', 'certificate_templates']
        LOOP
            IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
                BEGIN
                    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END;
            END IF;
        END LOOP;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 6. Deterministic ordering on get_outcome_graduates()
--    so .range() pagination never skips or duplicates rows
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_outcome_graduates()
RETURNS TABLE (
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    courses TEXT[],
    is_working BOOLEAN,
    started_month TEXT,
    field_of_work TEXT,
    employment_type TEXT,
    status_updated_at TIMESTAMPTZ,
    tracking_status TEXT,
    last_sent_at TIMESTAMPTZ,
    called_no_answer_at TIMESTAMPTZ,
    last_completed_date DATE,
    course_completed_dates JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH completed AS (
        SELECT
            e.student_id,
            COALESCE(c.name, 'Unknown') AS course_name,
            MAX(COALESCE(
                e.completed_date,
                e.confirmed_date,
                (e.completed_at AT TIME ZONE 'Europe/Dublin')::date,
                e.invited_date,
                (e.created_at AT TIME ZONE 'Europe/Dublin')::date
            )) AS completed_date
        FROM public.enrollments e
        LEFT JOIN public.courses c ON c.id = e.course_id
        WHERE e.status = 'completed'
        GROUP BY e.student_id, COALESCE(c.name, 'Unknown')
    )
    SELECT
        s.id,
        COALESCE(s.first_name, ''),
        COALESCE(s.last_name, ''),
        COALESCE(s.email, ''),
        NULLIF(TRIM(s.phone), ''),
        array_agg(comp.course_name ORDER BY comp.course_name),
        es.is_working,
        es.started_month,
        es.field_of_work,
        es.employment_type,
        es.last_responded_at,
        CASE WHEN es.id IS NULL THEN 'not_contacted' ELSE es.status END,
        es.last_invited_at,
        es.called_no_answer_at,
        MAX(comp.completed_date),
        jsonb_object_agg(comp.course_name, comp.completed_date)
    FROM completed comp
    JOIN public.students s ON s.id = comp.student_id
    LEFT JOIN public.employment_status es ON es.student_id = s.id
    GROUP BY s.id, es.id
    ORDER BY s.last_name ASC NULLS LAST, s.first_name ASC NULLS LAST, s.id ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_outcome_graduates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_outcome_graduates() TO authenticated;

NOTIFY pgrst, 'reload schema';
