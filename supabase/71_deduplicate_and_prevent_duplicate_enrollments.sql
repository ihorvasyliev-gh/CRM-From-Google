-- ============================================================
-- Migration 71: Deduplicate and Prevent Duplicate Course Enrollments
-- ============================================================
-- Problem:
-- When a student is already enrolled/invited in a course and later submits
-- a Google Form (or is imported) selecting that same course, subtle differences
-- in course_variant (e.g. NULL vs 'English' vs 'SNA (English)') or missing
-- existence checks created a second duplicate enrollment in 'requested' status.
--
-- Solution:
-- 1. One-time cleanup: merge and remove any duplicate enrollments for the same
--    (student_id, course_id), preserving the winning status, earliest queue date,
--    invitation dates, response days, and notes.
-- 2. Trigger guard: prevent insertion of duplicate active enrollments
--    (status NOT IN ('withdrawn', 'rejected')) for the same (student_id, course_id).
-- ============================================================

-- 1. Deduplicate any existing duplicate enrollments across the database
DO $$
DECLARE
    r RECORD;
    v_winner_id UUID;
BEGIN
    FOR r IN 
        SELECT student_id, course_id, COUNT(*) as cnt
        FROM public.enrollments
        GROUP BY student_id, course_id
        HAVING COUNT(*) > 1
    LOOP
        -- Find the best/winning enrollment:
        -- Priority: completed (1) > confirmed (2) > invited (3) > requested (4) > other (5)
        -- Tie-breaker: has invited_date or confirmed_date, then earliest created_at
        SELECT id INTO v_winner_id
        FROM public.enrollments
        WHERE student_id = r.student_id AND course_id = r.course_id
        ORDER BY 
            (CASE status 
                WHEN 'completed' THEN 1 
                WHEN 'confirmed' THEN 2 
                WHEN 'invited'   THEN 3 
                WHEN 'requested' THEN 4 
                ELSE 5 
             END),
            (CASE WHEN invited_date IS NOT NULL OR confirmed_date IS NOT NULL THEN 0 ELSE 1 END),
            created_at ASC
        LIMIT 1;

        -- Merge data from other duplicate enrollments into the winner
        UPDATE public.enrollments w
        SET 
            created_at = (SELECT MIN(created_at) FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id),
            is_priority = (SELECT bool_or(COALESCE(is_priority, false)) FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id),
            invited_date = COALESCE(w.invited_date, (SELECT invited_date FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND invited_date IS NOT NULL ORDER BY created_at ASC LIMIT 1)),
            confirmed_date = COALESCE(w.confirmed_date, (SELECT confirmed_date FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND confirmed_date IS NOT NULL ORDER BY created_at ASC LIMIT 1)),
            completed_date = COALESCE(w.completed_date, (SELECT completed_date FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND completed_date IS NOT NULL ORDER BY created_at ASC LIMIT 1)),
            invited_at = COALESCE(w.invited_at, (SELECT invited_at FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND invited_at IS NOT NULL ORDER BY invited_at DESC LIMIT 1)),
            confirmed_at = COALESCE(w.confirmed_at, (SELECT confirmed_at FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND confirmed_at IS NOT NULL ORDER BY confirmed_at DESC LIMIT 1)),
            completed_at = COALESCE(w.completed_at, (SELECT completed_at FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1)),
            response_days = COALESCE(w.response_days, (SELECT response_days FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND response_days IS NOT NULL LIMIT 1), 7),
            course_variant = COALESCE(NULLIF(TRIM(w.course_variant), ''), (SELECT course_variant FROM public.enrollments WHERE student_id = r.student_id AND course_id = r.course_id AND course_variant IS NOT NULL AND TRIM(course_variant) <> '' LIMIT 1), 'English'),
            notes = (
                SELECT string_agg(DISTINCT NULLIF(TRIM(notes), ''), ' | ')
                FROM public.enrollments 
                WHERE student_id = r.student_id AND course_id = r.course_id
            ),
            updated_at = now()
        WHERE w.id = v_winner_id;

        -- Delete redundant duplicate enrollments for this student and course
        DELETE FROM public.enrollments 
        WHERE student_id = r.student_id 
          AND course_id = r.course_id 
          AND id <> v_winner_id;
    END LOOP;
END $$;

-- 2. Trigger to prevent duplicate active enrollments on INSERT
CREATE OR REPLACE FUNCTION public.prevent_duplicate_course_enrollment()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id UUID;
BEGIN
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

DROP TRIGGER IF EXISTS trg_prevent_duplicate_course_enrollment ON public.enrollments;
CREATE TRIGGER trg_prevent_duplicate_course_enrollment
BEFORE INSERT ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_course_enrollment();
