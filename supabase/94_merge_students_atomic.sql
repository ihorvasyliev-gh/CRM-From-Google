-- ============================================================
-- Migration 94: merge duplicate students in one step
--
-- Until now the Merge window made three separate calls:
--   1. clear the duplicate's email (so the kept record can take it),
--   2. save the details picked from the duplicate onto the kept record,
--   3. merge_students (move enrollments, flags, outcomes; delete the duplicate).
-- If step 3 failed, steps 1-2 stayed done: the kept record had already
-- changed and the duplicate could be left without its email.
--
-- merge_students_with_changes does all three inside one function, so
-- Postgres runs them as one transaction: either everything happens,
-- or nothing changes at all.
--
-- p_changes is a JSON object with any of: first_name, last_name, email,
-- phone, address, eircode, dob ('YYYY-MM-DD'). Only keys present are
-- written; other keys are ignored.
--
-- Admins only, like merge_students (migration 63).
-- Until this runs, the Merge window falls back to the old three calls.
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

CREATE OR REPLACE FUNCTION public.merge_students_with_changes(
    p_primary_id UUID,
    p_duplicate_id UUID,
    p_changes JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
    v_changes JSONB := COALESCE(p_changes, '{}'::jsonb);
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

    -- Any error in here undoes the two updates above as well.
    PERFORM public.merge_students_unchecked(p_primary_id, p_duplicate_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.merge_students_with_changes(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_students_with_changes(UUID, UUID, JSONB) TO authenticated;
