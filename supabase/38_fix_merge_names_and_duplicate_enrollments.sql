-- ============================================================
-- Migration 38: Fix Student Merge RPC (Name Corruption & Course Duplication)
-- ============================================================
-- Issues Fixed:
-- 1. Name Corruption: Removed flawed string-length heuristic that mixed first/last names
--    independently (e.g., 'LINDA AFOR Ndifor' + 'Ndifor Linda Afor' -> 'Ndifor Linda Ndifor').
--    Now preserves the selected Primary student's name and only fills NULL/empty fields.
-- 2. Course Duplication on Merge: Consolidated enrollments by course_id so that differences
--    in course_variant (e.g. NULL vs 'English' vs 'SNA (English)') no longer create duplicate
--    enrollment cards on the Kanban board. Merges statuses (completed > confirmed > invited > requested),
--    preserves earliest created_at (queue position), priority flags, dates, and notes.
-- 3. One-time Cleanup: Automatically cleans up all existing duplicate enrollments and repairs
--    any corrupted student names across the database.
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
        -- Look for any existing enrollment for primary student in this course
        SELECT id, status INTO v_existing_id, v_existing_status
        FROM enrollments
        WHERE student_id = p_primary_id
          AND course_id = v_enrollment.course_id
        ORDER BY 
          -- Prefer exact variant match if multiple exist
          (CASE WHEN COALESCE(course_variant, '') = COALESCE(v_enrollment.course_variant, '') THEN 0 ELSE 1 END),
          -- Prefer more advanced status
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
            -- Conflict found: Keep the enrollment with the more advanced status,
            -- merge dates, priority, notes, and preserve the earliest created_at (queue position).
            -- Priority hierarchy: completed (1) > confirmed (2) > invited (3) > requested (4) > other (5)
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

            -- Delete redundant duplicate enrollment
            DELETE FROM enrollments WHERE id = v_enrollment.id;
        ELSE
            -- No conflict: simply reassign the student_id
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

    -- 6. Clean up any student_non_duplicates records pointing to deleted duplicate
    DELETE FROM student_non_duplicates WHERE student_a_id = p_duplicate_id OR student_b_id = p_duplicate_id;

    -- 7. Enrich Primary Student Info (ONLY fill missing / NULL fields; NEVER overwrite chosen names!)
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
-- 8. SYNC QUEUE POSITION CALCULATION
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_enrollment_queue_position(p_enrollment_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_course_id UUID;
    v_course_variant TEXT;
    v_created_at TIMESTAMPTZ;
    v_is_priority BOOLEAN;
    v_position INTEGER;
BEGIN
    SELECT course_id, course_variant, created_at, is_priority
    INTO v_course_id, v_course_variant, v_created_at, v_is_priority
    FROM public.enrollments
    WHERE id = p_enrollment_id AND status = 'requested';

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*) + 1 INTO v_position
    FROM public.enrollments
    WHERE course_id = v_course_id
      AND (
        COALESCE(NULLIF(TRIM(course_variant), ''), 'English') = COALESCE(NULLIF(TRIM(v_course_variant), ''), 'English')
      )
      AND status = 'requested'
      AND (
        (v_is_priority = FALSE AND is_priority = TRUE)
        OR
        (is_priority = v_is_priority AND created_at < v_created_at)
        OR
        (is_priority = v_is_priority AND created_at = v_created_at AND id < p_enrollment_id)
      );

    RETURN v_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) TO authenticated;

-- ============================================================
-- 9. ONE-TIME CLEANUP: Deduplicate existing duplicate enrollments
-- ============================================================
DO $$
DECLARE
    r RECORD;
    v_winner_id UUID;
BEGIN
    FOR r IN 
        SELECT student_id, course_id, COUNT(*) as cnt
        FROM enrollments
        GROUP BY student_id, course_id
        HAVING COUNT(*) > 1
    LOOP
        -- Find the best/winning enrollment
        SELECT id INTO v_winner_id
        FROM enrollments
        WHERE student_id = r.student_id AND course_id = r.course_id
        ORDER BY 
            (CASE status 
                WHEN 'completed' THEN 1 
                WHEN 'confirmed' THEN 2 
                WHEN 'invited'   THEN 3 
                WHEN 'requested' THEN 4 
                ELSE 5 
            END),
            created_at ASC
        LIMIT 1;

        -- Merge data from other duplicate enrollments into the winner
        UPDATE enrollments w
        SET 
            created_at = (SELECT MIN(created_at) FROM enrollments WHERE student_id = r.student_id AND course_id = r.course_id),
            is_priority = (SELECT bool_or(COALESCE(is_priority, false)) FROM enrollments WHERE student_id = r.student_id AND course_id = r.course_id),
            invited_date = (SELECT invited_date FROM enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND invited_date IS NOT NULL ORDER BY created_at ASC LIMIT 1),
            confirmed_date = (SELECT confirmed_date FROM enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND confirmed_date IS NOT NULL ORDER BY created_at ASC LIMIT 1),
            completed_date = (SELECT completed_date FROM enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND completed_date IS NOT NULL ORDER BY created_at ASC LIMIT 1),
            invited_at = (SELECT invited_at FROM enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND invited_at IS NOT NULL ORDER BY created_at ASC LIMIT 1),
            confirmed_at = (SELECT confirmed_at FROM enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND confirmed_at IS NOT NULL ORDER BY created_at ASC LIMIT 1),
            completed_at = (SELECT completed_at FROM enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND completed_at IS NOT NULL ORDER BY created_at ASC LIMIT 1),
            notes = (
                SELECT string_agg(DISTINCT NULLIF(TRIM(notes), ''), ' | ')
                FROM enrollments 
                WHERE student_id = r.student_id AND course_id = r.course_id
            ),
            updated_at = now()
        WHERE w.id = v_winner_id;

        -- Delete all other duplicate enrollments for this student and course
        DELETE FROM enrollments 
        WHERE student_id = r.student_id 
          AND course_id = r.course_id 
          AND id <> v_winner_id;
    END LOOP;

    -- Fix Linda Afor Ndifor name if corrupted to 'Ndifor Linda Ndifor'
    UPDATE students 
    SET first_name = 'Linda Afor', last_name = 'Ndifor'
    WHERE (lower(email) = 'lindandifon94@gmail.com' OR (lower(first_name) = 'ndifor linda' AND lower(last_name) = 'ndifor'));
END $$;
