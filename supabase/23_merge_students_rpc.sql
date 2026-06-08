-- ============================================================
-- Migration 23: Student Merge RPC
-- Creates the merge_students function to consolidate duplicate profiles.
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
    -- 1. Fetch details of both students
    SELECT * INTO v_primary FROM students WHERE id = p_primary_id;
    SELECT * INTO v_duplicate FROM students WHERE id = p_duplicate_id;
    
    IF v_primary.id IS NULL THEN
        RAISE EXCEPTION 'Primary student with ID % not found.', p_primary_id;
    END IF;
    IF v_duplicate.id IS NULL THEN
        RAISE EXCEPTION 'Duplicate student with ID % not found.', p_duplicate_id;
    END IF;
    
    IF p_primary_id = p_duplicate_id THEN
        RAISE EXCEPTION 'Cannot merge a student into themselves.';
    END IF;

    -- 2. Consolidate Enrollments (handling unique index conflicts)
    FOR v_enrollment IN SELECT * FROM enrollments WHERE student_id = p_duplicate_id LOOP
        -- Check if primary already has enrollment for this course and variant
        SELECT id, status INTO v_existing_id, v_existing_status
        FROM enrollments
        WHERE student_id = p_primary_id
          AND course_id = v_enrollment.course_id
          AND COALESCE(course_variant, '') = COALESCE(v_enrollment.course_variant, '');

        IF v_existing_id IS NOT NULL THEN
            -- Conflict found: Keep the enrollment with the more advanced status
            -- Status priority hierarchy: completed > confirmed > invited > requested > rejected/withdrawn
            IF (v_enrollment.status IN ('completed', 'confirmed') AND v_existing_status NOT IN ('completed', 'confirmed'))
               OR (v_enrollment.status = 'invited' AND v_existing_status IN ('requested', 'rejected', 'withdrawn'))
            THEN
                UPDATE enrollments
                SET status = v_enrollment.status,
                    invited_date = COALESCE(invited_date, v_enrollment.invited_date),
                    confirmed_date = COALESCE(confirmed_date, v_enrollment.confirmed_date),
                    completed_date = COALESCE(completed_date, v_enrollment.completed_date),
                    invited_at = COALESCE(invited_at, v_enrollment.invited_at),
                    confirmed_at = COALESCE(confirmed_at, v_enrollment.confirmed_at),
                    completed_at = COALESCE(completed_at, v_enrollment.completed_at),
                    notes = TRIM(CONCAT(COALESCE(notes, ''), ' ', COALESCE(v_enrollment.notes, '')))
                WHERE id = v_existing_id;
            END IF;
            
            -- Delete the redundant enrollment
            DELETE FROM enrollments WHERE id = v_enrollment.id;
        ELSE
            -- No conflict: simply reassign the student_id
            UPDATE enrollments SET student_id = p_primary_id WHERE id = v_enrollment.id;
        END IF;
    END LOOP;

    -- 3. Consolidate Student Flags (no strict unique index, but avoid exact duplicates)
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

    -- 4. Consolidate Employment Status (one-to-one mapping unique on student_id)
    SELECT id, status, is_working, started_month, field_of_work, employment_type, last_invited_at, last_responded_at
    INTO v_prim_emp_id, v_prim_emp_status, v_prim_working, v_prim_started, v_prim_field, v_prim_type, v_prim_invited, v_prim_responded
    FROM employment_status
    WHERE student_id = p_primary_id;

    SELECT id, status, is_working, started_month, field_of_work, employment_type, last_invited_at, last_responded_at
    INTO v_dup_emp_id, v_dup_emp_status, v_dup_working, v_dup_started, v_dup_field, v_dup_type, v_dup_invited, v_dup_responded
    FROM employment_status
    WHERE student_id = p_duplicate_id;

    IF v_prim_emp_id IS NOT NULL AND v_dup_emp_id IS NOT NULL THEN
        -- Both exist: keep the responded one, or merge details
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
        -- Only duplicate had employment status: reassign it to primary
        UPDATE employment_status SET student_id = p_primary_id WHERE id = v_dup_emp_id;
    END IF;

    -- 6. Delete Duplicate Student Profile
    DELETE FROM students WHERE id = p_duplicate_id;

    -- 5. Enrich Primary Student Info
    UPDATE students
    SET
        first_name = CASE
            WHEN length(COALESCE(v_duplicate.first_name, '')) > length(COALESCE(first_name, '')) THEN v_duplicate.first_name
            ELSE first_name
        END,
        last_name = CASE
            WHEN length(COALESCE(v_duplicate.last_name, '')) > length(COALESCE(last_name, '')) THEN v_duplicate.last_name
            ELSE last_name
        END,
        phone = COALESCE(phone, v_duplicate.phone),
        address = COALESCE(address, v_duplicate.address),
        eircode = COALESCE(eircode, v_duplicate.eircode),
        dob = COALESCE(dob, v_duplicate.dob),
        created_at = LEAST(created_at, v_duplicate.created_at)
    WHERE id = p_primary_id;

END;
$$;

GRANT EXECUTE ON FUNCTION merge_students(UUID, UUID) TO authenticated;
