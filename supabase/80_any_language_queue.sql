-- ============================================================
-- Migration 80: "Any language" students queue in every language
--
-- Each language of a course has its own queue of requested students
-- (priority first, then the earliest registration). A student who can
-- take the course in either language has one enrollment with the
-- variant 'Any language' (the duplicate-enrollment trigger of
-- migration 71 allows one active enrollment per course) and now
-- stands in the queue of every language of the course at once:
-- e.g. #10 in English and #100 in Ukrainian.
--
-- get_enrollment_queue_position(): an English student's place counts
-- the English and the 'Any language' students ahead of them; an
-- 'Any language' student gets their best place over the course's
-- languages. Same rules as frontend/src/lib/queuePositions.ts (the
-- board also shows the place in each language).
--
-- The app keeps working without this migration: the board counts the
-- queues itself; the viewer roster and student panels show the old
-- per-variant numbers until it is applied.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_enrollment_queue_position(p_enrollment_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_course_id UUID;
    v_language TEXT;
    v_created_at TIMESTAMPTZ;
    v_is_priority BOOLEAN;
    v_languages TEXT[];
    v_queue TEXT;
    v_position INTEGER;
    v_best INTEGER;
BEGIN
    SELECT course_id, lower(COALESCE(NULLIF(TRIM(course_variant), ''), 'English')), created_at, is_priority
    INTO v_course_id, v_language, v_created_at, v_is_priority
    FROM public.enrollments
    WHERE id = p_enrollment_id AND status = 'requested';

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- The queues this enrollment stands in: its own language, or every language of the course
    IF v_language = 'any language' THEN
        SELECT array_agg(DISTINCT lower(COALESCE(NULLIF(TRIM(course_variant), ''), 'English')))
        INTO v_languages
        FROM public.enrollments
        WHERE course_id = v_course_id
          AND lower(COALESCE(NULLIF(TRIM(course_variant), ''), 'English')) <> 'any language';
    END IF;
    v_languages := COALESCE(v_languages, ARRAY[v_language]);

    FOREACH v_queue IN ARRAY v_languages LOOP
        SELECT COUNT(*) + 1 INTO v_position
        FROM public.enrollments
        WHERE course_id = v_course_id
          AND lower(COALESCE(NULLIF(TRIM(course_variant), ''), 'English')) IN (v_queue, 'any language')
          AND status = 'requested'
          AND (
            (v_is_priority = FALSE AND is_priority = TRUE)
            OR
            (is_priority = v_is_priority AND created_at < v_created_at)
            OR
            (is_priority = v_is_priority AND created_at = v_created_at AND id < p_enrollment_id)
          );
        v_best := LEAST(v_best, v_position);
    END LOOP;

    RETURN v_best;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) TO authenticated;
