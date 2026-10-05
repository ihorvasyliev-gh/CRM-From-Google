-- ============================================================
-- Migration 77: Change enrollment statuses in one transaction
--
-- The board, the bulk bar and the student drawer changed statuses with
-- several requests: one update per completed row, then a delete of the
-- student's still-"requested" duplicates. A failure half-way left some
-- rows changed and others not. Undo could not re-create a deleted
-- duplicate either: the duplicate-enrollment trigger (migration 71)
-- skips the insert while the student has an active row on the course.
--
-- 1. change_enrollment_status(): the whole change in one transaction —
--    the chosen rows, the student's other rows on the course for a
--    withdrawal, and the still-"requested" duplicates a completion
--    removes. Same rules as frontend/src/lib/enrollmentStatus.ts.
--    Returns the rows as they were and as they are now, and the removed
--    rows, so Undo can put everything back.
-- 2. restore_enrollments(): Undo in one transaction — writes the saved
--    status fields back and re-creates the removed rows exactly.
-- 3. prevent_duplicate_course_enrollment() lets restore_enrollments()
--    re-create those rows (a transaction-local flag only it sets).
--
-- Both functions run with the caller's rights (SECURITY INVOKER): the
-- enrollments RLS policies decide who may change what, as with the
-- direct updates the app made so far (admins only).
--
-- The app keeps working without this migration (it falls back to the
-- separate requests); with it, each change is all-or-nothing.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

-- ------------------------------------------------------------
-- 1. Change the status of one or more enrollments
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_enrollment_status(
    p_ids            UUID[],
    p_status         TEXT,
    p_confirmed_date DATE DEFAULT NULL,  -- confirmed: the course date chosen in the dialog
    p_invited_date   DATE DEFAULT NULL,  -- invited: the date of a single-date invitation
    p_today          DATE DEFAULT CURRENT_DATE  -- the user's local date (completion of an undated row)
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

    SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_ids) AS x WHERE x IS NOT NULL;
    IF v_ids IS NULL THEN
        RETURN jsonb_build_object('previous', '[]'::jsonb, 'updated', '[]'::jsonb, 'removed', '[]'::jsonb);
    END IF;

    -- Lock the chosen rows and the student's other rows on those courses until commit, so the
    -- rows saved for Undo below are the ones actually changed
    PERFORM 1
    FROM enrollments e
    WHERE e.id = ANY (v_ids)
       OR EXISTS (
            SELECT 1 FROM enrollments c
            WHERE c.id = ANY (v_ids) AND c.student_id = e.student_id AND c.course_id = e.course_id
       )
    FOR UPDATE;

    -- Every chosen row must exist and be visible to the caller (RLS)
    IF (SELECT count(*) FROM enrollments WHERE id = ANY (v_ids)) < cardinality(v_ids) THEN
        RAISE EXCEPTION 'Some enrollments were not found: deleted meanwhile, or not yours to change'
            USING ERRCODE = 'P0002';
    END IF;

    -- Rows written: the chosen ones, plus for a withdrawal the student's other rows on the course
    SELECT array_agg(e.id) INTO v_update_ids
    FROM enrollments e
    WHERE e.id = ANY (v_ids)
       OR (p_status = 'withdrawn' AND EXISTS (
            SELECT 1 FROM enrollments c
            WHERE c.id = ANY (v_ids) AND c.student_id = e.student_id AND c.course_id = e.course_id
       ));

    -- As they were, for Undo
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id, 'status', e.status,
        'confirmed_date', e.confirmed_date, 'confirmed_at', e.confirmed_at,
        'invited_date', e.invited_date, 'invited_dates', e.invited_dates, 'invited_at', e.invited_at,
        'completed_date', e.completed_date, 'completed_at', e.completed_at
    )), '[]'::jsonb) INTO v_previous
    FROM enrollments e
    WHERE e.id = ANY (v_update_ids);

    WITH changed AS (
        UPDATE enrollments e SET
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
            completed_at = CASE WHEN p_status = 'completed' THEN v_now ELSE NULL END
        WHERE e.id = ANY (v_update_ids)
        RETURNING e.id, e.status, e.confirmed_date, e.confirmed_at, e.invited_date, e.invited_dates,
                  e.invited_at, e.completed_date, e.completed_at
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(changed)), '[]'::jsonb) INTO v_updated FROM changed;

    -- Completing removes the student's still-"requested" duplicates on the same course
    IF p_status = 'completed' THEN
        WITH removed AS (
            DELETE FROM enrollments e
            WHERE e.status = 'requested'
              AND NOT (e.id = ANY (v_ids))
              AND EXISTS (
                  SELECT 1 FROM enrollments c
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

-- ------------------------------------------------------------
-- 2. Undo: put rows back as they were
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_enrollments(
    p_rows    JSONB,                  -- [{ id, status, confirmed_date, …, completed_at }] as returned in "previous"
    p_removed JSONB DEFAULT '[]'      -- full rows to re-create, as returned in "removed"
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
    UPDATE enrollments e SET
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
        RAISE EXCEPTION 'Some enrollments were not found: deleted meanwhile, or not yours to change'
            USING ERRCODE = 'P0002';
    END IF;

    IF jsonb_array_length(v_removed) > 0 THEN
        -- The rows existed side by side before, so the duplicate check must let them back in
        PERFORM set_config('crm.restoring_enrollments', 'on', true);
        INSERT INTO enrollments
        SELECT * FROM jsonb_populate_recordset(NULL::enrollments, v_removed)
        ON CONFLICT (id) DO NOTHING;
        PERFORM set_config('crm.restoring_enrollments', 'off', true);
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_enrollments(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_enrollments(JSONB, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 3. Duplicate check (migration 71), letting Undo re-create rows
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_duplicate_course_enrollment()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id UUID;
BEGIN
    -- Set only inside restore_enrollments(): rows put back exactly as they were
    IF current_setting('crm.restoring_enrollments', true) = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_existing_id
    FROM public.enrollments
    WHERE student_id = NEW.student_id
      AND course_id = NEW.course_id
      AND status NOT IN ('withdrawn', 'rejected')
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Silently skip inserting duplicate active enrollment
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- New functions: let the API see them straight away
NOTIFY pgrst, 'reload schema';
