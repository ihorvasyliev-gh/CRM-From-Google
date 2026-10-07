-- ============================================================
-- Migration 81: One queue per language, several languages at once
--
-- Each language of a course has its own queue of requested students
-- (priority first, then the earliest registration). A student can
-- queue in several languages of the same course at once: one
-- enrollment per language, each with its own registration date, so
-- registering for Ukrainian today and for English tomorrow gives two
-- places, e.g. #10 in Ukrainian and #100 in English.
--
-- 1. course_variant_key(): the language of an enrollment for
--    comparisons, by the rules of cleanVariant in
--    frontend/src/lib/types.ts ("SNA (English)", "english" and an
--    empty variant are all 'english').
-- 2. prevent_duplicate_course_enrollment() (migrations 71 and 77) no
--    longer skips every second enrollment on a course: a new
--    "requested" enrollment in another language is let in while all of
--    the student's active enrollments on the course are still
--    "requested". The same language, or anything once one of them is
--    invited, confirmed or completed, is still skipped. Completing the
--    course deletes the student's leftover "requested" languages
--    (change_enrollment_status, migration 77).
-- 3. get_enrollment_queue_position() compares languages with
--    course_variant_key(), as the board does. This replaces the
--    "Any language" counting of migration 80: a student who can take
--    several languages now gets one enrollment for each.
-- 4. Lists the enrollments already marked "Any language", to re-add
--    for the languages the student wants (Add Enrollment allows it
--    now) and then delete.
--
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

-- ------------------------------------------------------------
-- 1. The language of an enrollment, for comparisons
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.course_variant_key(p_course_name TEXT, p_variant TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_variant  TEXT := TRIM(COALESCE(p_variant, ''));
    v_name     TEXT := COALESCE(p_course_name, '');
    v_inner    TEXT;
    v_stripped TEXT;
BEGIN
    IF v_variant = '' THEN
        RETURN 'english';
    END IF;
    -- Text inside parentheses: "SNA (English)" → "English"
    v_inner := TRIM(substring(v_variant from '\((.*?)\)'));
    IF v_inner IS NOT NULL AND v_inner <> '' THEN
        v_variant := v_inner;
    -- The course name in front: "ECDL Ukrainian" → "Ukrainian"
    ELSIF v_name <> '' AND left(lower(v_variant), length(v_name)) = lower(v_name) THEN
        v_stripped := TRIM(regexp_replace(TRIM(substr(v_variant, length(v_name) + 1)), '^[-()_:]+|[-()_:]+$', '', 'g'));
        IF v_stripped <> '' THEN
            v_variant := v_stripped;
        END IF;
    END IF;
    RETURN lower(v_variant);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.course_variant_key(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.course_variant_key(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2. Duplicate check: one active enrollment per language
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_duplicate_course_enrollment()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id UUID;
    v_course_name TEXT;
BEGIN
    -- Set only inside restore_enrollments(): rows put back exactly as they were
    IF current_setting('crm.restoring_enrollments', true) = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_course_name FROM public.courses WHERE id = NEW.course_id;

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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 3. Place in the queue of the enrollment's language
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_enrollment_queue_position(p_enrollment_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_course_id UUID;
    v_course_name TEXT;
    v_language TEXT;
    v_created_at TIMESTAMPTZ;
    v_is_priority BOOLEAN;
    v_position INTEGER;
BEGIN
    SELECT e.course_id, c.name, public.course_variant_key(c.name, e.course_variant), e.created_at, e.is_priority
    INTO v_course_id, v_course_name, v_language, v_created_at, v_is_priority
    FROM public.enrollments e
    LEFT JOIN public.courses c ON c.id = e.course_id
    WHERE e.id = p_enrollment_id AND e.status = 'requested';

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*) + 1 INTO v_position
    FROM public.enrollments
    WHERE course_id = v_course_id
      AND public.course_variant_key(v_course_name, course_variant) = v_language
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

REVOKE EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. Enrollments marked "Any language" under migration 80
-- ------------------------------------------------------------
SELECT s.first_name, s.last_name, c.name AS course, e.status, e.created_at AS registered
FROM public.enrollments e
JOIN public.students s ON s.id = e.student_id
JOIN public.courses c ON c.id = e.course_id
WHERE lower(TRIM(e.course_variant)) = 'any language'
ORDER BY c.name, e.created_at;
