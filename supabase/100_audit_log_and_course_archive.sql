-- ============================================================
-- Migration 100: Immutable Audit Log, Course Archiving &
--                Undo Concurrency Safety
--
-- 1. public.audit_log table (append-only via internal SECURITY
--    DEFINER helper write_audit_log; admins have SELECT only).
-- 2. Course archiving: courses.archived_at + partial index for
--    active courses.
-- 3. Audit triggers & RPC instrumentation:
--      * trg_audit_student_delete (students AFTER DELETE; skipped
--        during student merges via crm.merging_students = 'on').
--      * trg_audit_course_archive / trg_audit_course_delete
--        (courses AFTER UPDATE OF archived_at / AFTER DELETE).
--      * merge_students_with_changes() & merge_students()
--        ('student.merge').
--      * set_user_role() & promote_user_to_admin()
--        ('user.role_changed', preserving push subscription
--        cleanup from migration 98).
--      * opt_out_email() & opt_in_email()
--        ('email.opted_out' / 'email.opted_in').
-- 4. Undo concurrency safety & deadlock prevention:
--      * change_enrollment_status(): locks rows in deterministic
--        ORDER BY e.id FOR UPDATE order and includes updated_at
--        in each element of the returned "updated" JSON array.
--      * restore_enrollments(): returns JSONB
--        { restored_count, skipped_ids }, locks rows in
--        deterministic id order, keeps crm.restoring_enrollments
--        enabled for both UPDATE and INSERT, and skips any row
--        whose live status or updated_at no longer matches
--        expected_status / expected_updated_at when supplied
--        (100% backward compatible when omitted).
--
-- Safe to run more than once (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Audit log table, indexes, immutable RLS & internal helper
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
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

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
    ON public.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at
    ON public.audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON public.audit_log (entity_type, entity_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Immutable to clients: no INSERT / UPDATE / DELETE privileges or policies
REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

DROP POLICY IF EXISTS "Admins read audit log" ON public.audit_log;
CREATE POLICY "Admins read audit log"
    ON public.audit_log
    FOR SELECT
    TO authenticated
    USING ((SELECT public.is_app_admin()));

-- Internal helper callable only from SECURITY DEFINER triggers/RPCs (and service_role)
CREATE OR REPLACE FUNCTION public.write_audit_log(
    p_action      TEXT,
    p_entity_type TEXT,
    p_entity_id   TEXT,
    p_summary     TEXT,
    p_details     JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_actor_id    UUID;
    v_actor_email TEXT;
BEGIN
    v_actor_id := auth.uid();
    v_actor_email := COALESCE(
        NULLIF((SELECT auth.jwt()) ->> 'email', ''),
        (SELECT u.email::TEXT FROM auth.users u WHERE u.id = v_actor_id)
    );

    INSERT INTO public.audit_log (
        actor_id,
        actor_email,
        action,
        entity_type,
        entity_id,
        summary,
        details
    )
    VALUES (
        v_actor_id,
        v_actor_email,
        p_action,
        p_entity_type,
        p_entity_id,
        p_summary,
        COALESCE(p_details, '{}'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.write_audit_log(TEXT, TEXT, TEXT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Course archiving column & active-courses index
--    (Added before course archive trigger below)
-- ------------------------------------------------------------
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_courses_active
    ON public.courses (name)
    WHERE archived_at IS NULL;

-- ------------------------------------------------------------
-- 3. Audit triggers on students and courses
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_student_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_name    TEXT;
    v_email   TEXT;
    v_summary TEXT;
BEGIN
    IF current_setting('crm.merging_students', true) = 'on' THEN
        RETURN OLD;
    END IF;

    v_name := NULLIF(btrim(COALESCE(OLD.first_name, '') || ' ' || COALESCE(OLD.last_name, '')), '');
    v_email := NULLIF(btrim(COALESCE(OLD.email, '')), '');

    v_summary := CASE
        WHEN v_name IS NOT NULL AND v_email IS NOT NULL THEN format('Deleted student %s (%s)', v_name, v_email)
        WHEN v_name IS NOT NULL THEN format('Deleted student %s', v_name)
        WHEN v_email IS NOT NULL THEN format('Deleted student (%s)', v_email)
        ELSE format('Deleted student %s', OLD.id::TEXT)
    END;

    PERFORM public.write_audit_log(
        'student.delete',
        'student',
        OLD.id::TEXT,
        v_summary,
        jsonb_build_object(
            'first_name', OLD.first_name,
            'last_name',  OLD.last_name,
            'full_name',  v_name,
            'email',      OLD.email,
            'phone',      OLD.phone
        )
    );

    RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_student_delete()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_student_delete ON public.students;
CREATE TRIGGER trg_audit_student_delete
    AFTER DELETE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_student_delete();

CREATE OR REPLACE FUNCTION public.audit_course_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.write_audit_log(
            'course.deleted',
            'course',
            OLD.id::TEXT,
            format('Deleted course "%s"', COALESCE(OLD.name, OLD.id::TEXT)),
            jsonb_build_object(
                'name',        OLD.name,
                'archived_at', OLD.archived_at
            )
        );
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
            PERFORM public.write_audit_log(
                'course.archived',
                'course',
                NEW.id::TEXT,
                format('Archived course "%s"', COALESCE(NEW.name, NEW.id::TEXT)),
                jsonb_build_object(
                    'name',        NEW.name,
                    'archived_at', NEW.archived_at
                )
            );
        ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
            PERFORM public.write_audit_log(
                'course.unarchived',
                'course',
                NEW.id::TEXT,
                format('Unarchived course "%s"', COALESCE(NEW.name, NEW.id::TEXT)),
                jsonb_build_object(
                    'name',                 NEW.name,
                    'previous_archived_at', OLD.archived_at
                )
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_course_change()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_course_archive ON public.courses;
CREATE TRIGGER trg_audit_course_archive
    AFTER UPDATE OF archived_at ON public.courses
    FOR EACH ROW
    WHEN (OLD.archived_at IS DISTINCT FROM NEW.archived_at)
    EXECUTE FUNCTION public.audit_course_change();

DROP TRIGGER IF EXISTS trg_audit_course_delete ON public.courses;
CREATE TRIGGER trg_audit_course_delete
    AFTER DELETE ON public.courses
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_course_change();

-- ------------------------------------------------------------
-- 4. RPC audit instrumentation
-- ------------------------------------------------------------

-- 4a. Student merges (preserving exact signatures from migrations 63 & 94)
CREATE OR REPLACE FUNCTION public.merge_students_with_changes(
    p_primary_id   UUID,
    p_duplicate_id UUID,
    p_changes      JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
    v_changes       JSONB := COALESCE(p_changes, '{}'::jsonb);
    v_primary_name  TEXT;
    v_primary_email TEXT;
    v_dup_name      TEXT;
    v_dup_email     TEXT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can merge students' USING ERRCODE = '42501';
    END IF;

    IF p_primary_id IS NULL OR p_duplicate_id IS NULL THEN
        RAISE EXCEPTION 'Both students are needed to merge.';
    END IF;
    IF p_primary_id = p_duplicate_id THEN
        RAISE EXCEPTION 'Cannot merge a student into themselves.';
    END IF;
    IF jsonb_typeof(v_changes) <> 'object' THEN
        RAISE EXCEPTION 'Changes must be a JSON object.';
    END IF;

    -- Lock both rows in a fixed order (same as merge_students) so two
    -- people merging at once can't deadlock or interleave.
    IF p_primary_id < p_duplicate_id THEN
        PERFORM id FROM public.students WHERE id = p_primary_id FOR UPDATE;
        PERFORM id FROM public.students WHERE id = p_duplicate_id FOR UPDATE;
    ELSE
        PERFORM id FROM public.students WHERE id = p_duplicate_id FOR UPDATE;
        PERFORM id FROM public.students WHERE id = p_primary_id FOR UPDATE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_primary_id) THEN
        RAISE EXCEPTION 'The student to keep no longer exists.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_duplicate_id) THEN
        RAISE EXCEPTION 'The duplicate student no longer exists.';
    END IF;

    SELECT
        NULLIF(btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''),
        email
    INTO v_dup_name, v_dup_email
    FROM public.students
    WHERE id = p_duplicate_id;

    IF v_changes <> '{}'::jsonb THEN
        -- The duplicate is deleted below; clearing its email first lets the
        -- kept record take that email without hitting the UNIQUE constraint.
        UPDATE public.students SET email = NULL WHERE id = p_duplicate_id;

        UPDATE public.students SET
            first_name = CASE WHEN v_changes ? 'first_name' THEN v_changes->>'first_name' ELSE first_name END,
            last_name  = CASE WHEN v_changes ? 'last_name'  THEN v_changes->>'last_name'  ELSE last_name  END,
            email      = CASE WHEN v_changes ? 'email'      THEN NULLIF(TRIM(v_changes->>'email'), '') ELSE email END,
            phone      = CASE WHEN v_changes ? 'phone'      THEN v_changes->>'phone'      ELSE phone      END,
            address    = CASE WHEN v_changes ? 'address'    THEN v_changes->>'address'    ELSE address    END,
            eircode    = CASE WHEN v_changes ? 'eircode'    THEN v_changes->>'eircode'    ELSE eircode    END,
            dob        = CASE WHEN v_changes ? 'dob'        THEN NULLIF(v_changes->>'dob', '')::date ELSE dob END
        WHERE id = p_primary_id;
    END IF;

    -- Suppress trg_audit_student_delete while merge_students_unchecked deletes the duplicate
    PERFORM set_config('crm.merging_students', 'on', true);
    PERFORM public.merge_students_unchecked(p_primary_id, p_duplicate_id);
    PERFORM set_config('crm.merging_students', 'off', true);

    SELECT
        NULLIF(btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''),
        email
    INTO v_primary_name, v_primary_email
    FROM public.students
    WHERE id = p_primary_id;

    PERFORM public.write_audit_log(
        'student.merge',
        'student',
        p_primary_id::TEXT,
        format(
            'Merged student %s into %s',
            COALESCE(v_dup_name, p_duplicate_id::TEXT),
            COALESCE(v_primary_name, p_primary_id::TEXT)
        ),
        jsonb_build_object(
            'primary_id',      p_primary_id,
            'primary_name',    v_primary_name,
            'primary_email',   v_primary_email,
            'duplicate_id',    p_duplicate_id,
            'duplicate_name',  v_dup_name,
            'duplicate_email', v_dup_email,
            'changes',         v_changes
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.merge_students_with_changes(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_students_with_changes(UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_students(p_primary_id UUID, p_duplicate_id UUID)
RETURNS VOID AS $$
DECLARE
    v_primary_name  TEXT;
    v_primary_email TEXT;
    v_dup_name      TEXT;
    v_dup_email     TEXT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can merge students' USING ERRCODE = '42501';
    END IF;

    SELECT
        NULLIF(btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''),
        email
    INTO v_dup_name, v_dup_email
    FROM public.students
    WHERE id = p_duplicate_id;

    PERFORM set_config('crm.merging_students', 'on', true);
    PERFORM public.merge_students_unchecked(p_primary_id, p_duplicate_id);
    PERFORM set_config('crm.merging_students', 'off', true);

    SELECT
        NULLIF(btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''),
        email
    INTO v_primary_name, v_primary_email
    FROM public.students
    WHERE id = p_primary_id;

    PERFORM public.write_audit_log(
        'student.merge',
        'student',
        p_primary_id::TEXT,
        format(
            'Merged student %s into %s',
            COALESCE(v_dup_name, p_duplicate_id::TEXT),
            COALESCE(v_primary_name, p_primary_id::TEXT)
        ),
        jsonb_build_object(
            'primary_id',      p_primary_id,
            'primary_name',    v_primary_name,
            'primary_email',   v_primary_email,
            'duplicate_id',    p_duplicate_id,
            'duplicate_name',  v_dup_name,
            'duplicate_email', v_dup_email
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.merge_students(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_students(UUID, UUID) TO authenticated;

-- 4b. User role changes (preserving migration 98 push subscription cleanup)
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID AS $$
DECLARE
    v_current      TEXT;
    v_target_email TEXT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can change roles' USING ERRCODE = '42501';
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('viewer', 'outreach', 'forms', 'admin') THEN
        RAISE EXCEPTION 'Unknown role: %', p_role USING ERRCODE = '22023';
    END IF;

    -- A missing role has always meant admin (see migration 58)
    SELECT
        u.email::TEXT,
        COALESCE(NULLIF(u.raw_app_meta_data ->> 'role', ''), 'admin')
    INTO v_target_email, v_current
    FROM auth.users u
    WHERE u.id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_current NOT IN ('viewer', 'outreach', 'forms') THEN
        RAISE EXCEPTION 'Admins can''t be changed to another role' USING ERRCODE = '22023';
    END IF;

    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role),
        updated_at = now()
    WHERE id = p_user_id;

    -- Remove push subscriptions whenever the target role is not admin (migration 98)
    IF p_role <> 'admin' AND to_regclass('public.user_push_subscriptions') IS NOT NULL THEN
        DELETE FROM public.user_push_subscriptions WHERE user_id = p_user_id;
    END IF;

    IF v_current IS DISTINCT FROM p_role THEN
        PERFORM public.write_audit_log(
            'user.role_changed',
            'user',
            p_user_id::TEXT,
            format(
                'Changed role for %s from %s to %s',
                COALESCE(v_target_email, p_user_id::TEXT),
                v_current,
                p_role
            ),
            jsonb_build_object(
                'target_user_id', p_user_id,
                'target_email',   v_target_email,
                'old_role',       v_current,
                'new_role',       p_role
            )
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

-- Delegates to set_user_role() (migration 65) so promotions log one audit entry
CREATE OR REPLACE FUNCTION public.promote_user_to_admin(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM public.set_user_role(p_user_id, 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.promote_user_to_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(UUID) TO authenticated;

-- 4c. Email opt-out / opt-in (preserving exact signatures from migration 62)
CREATE OR REPLACE FUNCTION public.opt_out_email(p_email TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_email    TEXT := lower(trim(coalesce(p_email, '')));
    v_note     TEXT := nullif(trim(coalesce(p_note, '')), '');
    v_students INT;
    v_contacts INT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can manage unsubscribes' USING ERRCODE = '42501';
    END IF;
    IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
        RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.email_opt_outs (email, note, opted_out_at, created_by)
    VALUES (v_email, v_note, now(), auth.uid())
    ON CONFLICT (email) DO UPDATE SET
        note         = coalesce(EXCLUDED.note, public.email_opt_outs.note),
        opted_out_at = now(),
        created_by   = EXCLUDED.created_by;

    SELECT count(*) INTO v_students FROM public.students WHERE lower(trim(email)) = v_email;
    SELECT count(*) INTO v_contacts FROM public.outreach_contacts WHERE lower(trim(email)) = v_email;

    PERFORM public.write_audit_log(
        'email.opted_out',
        'email',
        v_email,
        format('Opted out email %s', v_email),
        jsonb_build_object(
            'email',    v_email,
            'note',     v_note,
            'students', v_students,
            'contacts', v_contacts
        )
    );

    RETURN jsonb_build_object('email', v_email, 'students', v_students, 'contacts', v_contacts);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.opt_out_email(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opt_out_email(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.opt_in_email(p_email TEXT)
RETURNS VOID AS $$
DECLARE
    v_email   TEXT := lower(trim(coalesce(p_email, '')));
    v_deleted INT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can manage unsubscribes' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.email_opt_outs WHERE email = v_email;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted > 0 THEN
        PERFORM public.write_audit_log(
            'email.opted_in',
            'email',
            v_email,
            format('Opted in email %s', v_email),
            jsonb_build_object('email', v_email)
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.opt_in_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opt_in_email(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 5. Undo concurrency safety & deadlock prevention
--    (migrations 77 & 99)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_enrollment_status(
    p_ids            UUID[],
    p_status         TEXT,
    p_confirmed_date DATE DEFAULT NULL,
    p_invited_date   DATE DEFAULT NULL,
    p_today          DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_now        TIMESTAMPTZ := now();
    v_ids        UUID[];
    v_update_ids UUID[];
    v_previous   JSONB;
    v_updated    JSONB;
    v_removed    JSONB := '[]'::jsonb;
BEGIN
    IF p_status IS NULL OR p_status NOT IN ('requested', 'invited', 'confirmed', 'completed', 'withdrawn', 'rejected') THEN
        RAISE EXCEPTION 'Unknown enrollment status: %', p_status USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids
    FROM unnest(p_ids) AS x
    WHERE x IS NOT NULL;

    IF v_ids IS NULL THEN
        RETURN jsonb_build_object('previous', '[]'::jsonb, 'updated', '[]'::jsonb, 'removed', '[]'::jsonb);
    END IF;

    -- Lock the chosen rows and the student's other rows on those courses in
    -- deterministic id order to avoid deadlocks on overlapping batch edits
    PERFORM e.id
    FROM public.enrollments e
    WHERE e.id = ANY (v_ids)
       OR EXISTS (
            SELECT 1 FROM public.enrollments c
            WHERE c.id = ANY (v_ids) AND c.student_id = e.student_id AND c.course_id = e.course_id
       )
    ORDER BY e.id
    FOR UPDATE OF e;

    -- Every chosen row must exist and be visible to the caller (RLS)
    IF (SELECT count(*) FROM public.enrollments WHERE id = ANY (v_ids)) < cardinality(v_ids) THEN
        RAISE EXCEPTION 'Some enrollments were not found: deleted meanwhile, or not yours to change'
            USING ERRCODE = 'P0002';
    END IF;

    -- Rows written: the chosen ones, plus for a withdrawal the student's other rows on the course
    SELECT array_agg(e.id ORDER BY e.id) INTO v_update_ids
    FROM public.enrollments e
    WHERE e.id = ANY (v_ids)
       OR (p_status = 'withdrawn' AND EXISTS (
            SELECT 1 FROM public.enrollments c
            WHERE c.id = ANY (v_ids) AND c.student_id = e.student_id AND c.course_id = e.course_id
       ));

    -- As they were, for Undo
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id, 'status', e.status,
        'confirmed_date', e.confirmed_date, 'confirmed_at', e.confirmed_at,
        'invited_date', e.invited_date, 'invited_dates', e.invited_dates, 'invited_at', e.invited_at,
        'completed_date', e.completed_date, 'completed_at', e.completed_at
    )), '[]'::jsonb) INTO v_previous
    FROM public.enrollments e
    WHERE e.id = ANY (v_update_ids);

    WITH changed AS (
        UPDATE public.enrollments e SET
            status = p_status,
            -- requested / rejected clear the invitation and the course date
            confirmed_date = CASE
                WHEN p_status IN ('requested', 'rejected') THEN NULL
                WHEN p_status = 'confirmed' AND p_confirmed_date IS NOT NULL THEN p_confirmed_date
                ELSE e.confirmed_date END,
            invited_date = CASE
                WHEN p_status IN ('requested', 'rejected') THEN NULL
                WHEN p_status = 'invited' AND p_invited_date IS NOT NULL THEN p_invited_date
                ELSE e.invited_date END,
            invited_dates = CASE WHEN p_status IN ('requested', 'rejected') THEN NULL ELSE e.invited_dates END,
            invited_at = CASE WHEN p_status IN ('requested', 'rejected') THEN NULL ELSE e.invited_at END,
            -- confirming stamps the time; completing keeps it (or sets it for a row never confirmed);
            -- every other status clears it
            confirmed_at = CASE
                WHEN p_status = 'confirmed' THEN v_now
                WHEN p_status = 'completed' THEN COALESCE(e.confirmed_at, v_now)
                ELSE NULL END,
            -- completing takes the course date (or today); every other status clears the completion
            completed_date = CASE WHEN p_status = 'completed' THEN COALESCE(e.confirmed_date, p_today) ELSE NULL END,
            completed_at = CASE WHEN p_status = 'completed' THEN v_now ELSE NULL END,
            updated_at = v_now
        WHERE e.id = ANY (v_update_ids)
        RETURNING e.id, e.status, e.confirmed_date, e.confirmed_at, e.invited_date, e.invited_dates,
                  e.invited_at, e.completed_date, e.completed_at, e.updated_at
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(changed)), '[]'::jsonb) INTO v_updated FROM changed;

    -- Completing removes the student's still-"requested" duplicates on the same course
    IF p_status = 'completed' THEN
        WITH removed AS (
            DELETE FROM public.enrollments e
            WHERE e.status = 'requested'
              AND NOT (e.id = ANY (v_ids))
              AND EXISTS (
                  SELECT 1 FROM public.enrollments c
                  WHERE c.id = ANY (v_ids) AND c.student_id = e.student_id AND c.course_id = e.course_id
              )
            RETURNING e.*
        )
        SELECT COALESCE(jsonb_agg(to_jsonb(removed)), '[]'::jsonb) INTO v_removed FROM removed;
    END IF;

    RETURN jsonb_build_object('previous', v_previous, 'updated', v_updated, 'removed', v_removed);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_enrollment_status(UUID[], TEXT, DATE, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_enrollment_status(UUID[], TEXT, DATE, DATE, DATE) TO authenticated;

-- Return type changes from VOID to JSONB: drop existing signature first
DROP FUNCTION IF EXISTS public.restore_enrollments(JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.restore_enrollments(
    p_rows    JSONB,
    p_removed JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_rows                JSONB := COALESCE(p_rows, '[]'::jsonb);
    v_removed             JSONB := COALESCE(p_removed, '[]'::jsonb);
    v_restored            INT := 0;
    v_skipped             UUID[] := ARRAY[]::UUID[];
    v_row                 RECORD;
    v_expected_updated_at TIMESTAMPTZ;
    v_expected_status     TEXT;
    v_live_status         TEXT;
    v_live_updated_at     TIMESTAMPTZ;
BEGIN
    -- Keep duplicate-enrollment trigger bypassed across BOTH updates and inserts
    PERFORM set_config('crm.restoring_enrollments', 'on', true);

    FOR v_row IN
        SELECT s.*
        FROM jsonb_to_recordset(v_rows) AS s(
            id                  UUID,
            status              TEXT,
            confirmed_date      DATE,
            confirmed_at        TIMESTAMPTZ,
            invited_date        DATE,
            invited_dates       DATE[],
            invited_at          TIMESTAMPTZ,
            completed_date      DATE,
            completed_at        TIMESTAMPTZ,
            expected_updated_at TEXT,
            expected_status     TEXT
        )
        ORDER BY s.id ASC
    LOOP
        v_expected_updated_at := NULLIF(btrim(v_row.expected_updated_at), '')::TIMESTAMPTZ;
        v_expected_status     := NULLIF(btrim(v_row.expected_status), '');

        IF v_expected_updated_at IS NOT NULL OR v_expected_status IS NOT NULL THEN
            SELECT e.status, e.updated_at
            INTO v_live_status, v_live_updated_at
            FROM public.enrollments e
            WHERE e.id = v_row.id
            FOR UPDATE;

            IF NOT FOUND
               OR (v_expected_status IS NOT NULL AND v_live_status IS DISTINCT FROM v_expected_status)
               OR (v_expected_updated_at IS NOT NULL AND v_live_updated_at IS DISTINCT FROM v_expected_updated_at)
            THEN
                v_skipped := array_append(v_skipped, v_row.id);
                CONTINUE;
            END IF;
        ELSE
            -- Backward-compatible unconditional restore when no concurrency guard is passed
            PERFORM e.id
            FROM public.enrollments e
            WHERE e.id = v_row.id
            FOR UPDATE;

            IF NOT FOUND THEN
                PERFORM set_config('crm.restoring_enrollments', 'off', true);
                RAISE EXCEPTION 'Some enrollments were not found: deleted meanwhile, or not yours to change'
                    USING ERRCODE = 'P0002';
            END IF;
        END IF;

        UPDATE public.enrollments SET
            status         = v_row.status,
            confirmed_date = v_row.confirmed_date,
            confirmed_at   = v_row.confirmed_at,
            invited_date   = v_row.invited_date,
            invited_dates  = v_row.invited_dates,
            invited_at     = v_row.invited_at,
            completed_date = v_row.completed_date,
            completed_at   = v_row.completed_at
        WHERE id = v_row.id;

        v_restored := v_restored + 1;
    END LOOP;

    -- Only re-insert deleted duplicate rows if every guarded row restored cleanly
    IF jsonb_array_length(v_removed) > 0 AND array_length(v_skipped, 1) IS NULL THEN
        INSERT INTO public.enrollments
        SELECT * FROM jsonb_populate_recordset(NULL::public.enrollments, v_removed)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    PERFORM set_config('crm.restoring_enrollments', 'off', true);

    RETURN jsonb_build_object(
        'restored_count', v_restored,
        'skipped_ids',    to_jsonb(v_skipped)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_enrollments(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_enrollments(JSONB, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
