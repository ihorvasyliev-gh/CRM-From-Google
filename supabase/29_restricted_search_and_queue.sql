-- ============================================================
-- Migration 29: Restricted Search & Database Security Hardening
-- ============================================================

-- 1. Recreate RLS policies for all tables to restrict access for 'viewer' role
-- Using 'app_metadata' instead of 'user_metadata' for security compliance.

-- Students
DROP POLICY IF EXISTS "Authenticated access" ON public.students;
CREATE POLICY "Authenticated access" ON public.students
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Courses
DROP POLICY IF EXISTS "Authenticated access" ON public.courses;
CREATE POLICY "Authenticated access" ON public.courses
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Enrollments
DROP POLICY IF EXISTS "Authenticated access" ON public.enrollments;
CREATE POLICY "Authenticated access" ON public.enrollments
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Invite Dates
DROP POLICY IF EXISTS "Authenticated access" ON public.invite_dates;
CREATE POLICY "Authenticated access" ON public.invite_dates
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Document Templates
DROP POLICY IF EXISTS "Authenticated access" ON public.document_templates;
CREATE POLICY "Authenticated access" ON public.document_templates
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Attendance Templates
DROP POLICY IF EXISTS "Authenticated access" ON public.attendance_templates;
CREATE POLICY "Authenticated access" ON public.attendance_templates
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Label Templates
DROP POLICY IF EXISTS "Authenticated access" ON public.label_templates;
CREATE POLICY "Authenticated access" ON public.label_templates
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Template Variables
DROP POLICY IF EXISTS "Authenticated access" ON public.template_variables;
CREATE POLICY "Authenticated access" ON public.template_variables
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Employment Status
DROP POLICY IF EXISTS "Authenticated can manage employment_status" ON public.employment_status;
CREATE POLICY "Authenticated can manage employment_status" ON public.employment_status
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Student Flags
DROP POLICY IF EXISTS "Authenticated access" ON public.student_flags;
CREATE POLICY "Authenticated access" ON public.student_flags
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- Confirmation Tokens
DROP POLICY IF EXISTS "Authenticated can manage tokens" ON public.confirmation_tokens;
CREATE POLICY "Authenticated can manage tokens" ON public.confirmation_tokens
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );


-- 2. Create helper functions and security definer RPCs

-- public.get_enrollment_queue_position
-- Helper to calculate the queue position for requested status enrollments
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
      AND COALESCE(course_variant, '') = COALESCE(v_course_variant, '')
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

-- public.search_students_restricted
-- Restricted search function for viewer role.
-- Splits query into terms and finds matching students. Requires >= 3 characters.
CREATE OR REPLACE FUNCTION public.search_students_restricted(p_query TEXT)
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    eircode TEXT,
    dob DATE,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_clean_query TEXT := trim(p_query);
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.address, s.eircode, s.dob, s.created_at
    FROM public.students s
    WHERE (
        length(v_clean_query) >= 3 AND (
            NOT EXISTS (
                SELECT 1
                FROM unnest(string_to_array(v_clean_query, ' ')) AS term
                WHERE NOT (
                    s.first_name ILIKE '%' || term || '%' OR
                    s.last_name ILIKE '%' || term || '%' OR
                    s.email ILIKE '%' || term || '%' OR
                    s.phone ILIKE '%' || term || '%' OR
                    s.eircode ILIKE '%' || replace(term, ' ', '') || '%'
                )
            )
        )
    )
    ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- public.get_student_detail_restricted
-- Returns student details + enrollments (with queue positions calculated) as a JSONB object.
CREATE OR REPLACE FUNCTION public.get_student_detail_restricted(p_student_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_student_data JSONB;
    v_enrollments_data JSONB;
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT jsonb_build_object(
        'id', s.id,
        'first_name', s.first_name,
        'last_name', s.last_name,
        'email', s.email,
        'phone', s.phone,
        'address', s.address,
        'eircode', s.eircode,
        'dob', s.dob,
        'created_at', s.created_at
    ) INTO v_student_data
    FROM public.students s
    WHERE s.id = p_student_id;

    IF v_student_data IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', e.id,
            'status', e.status,
            'course_variant', e.course_variant,
            'created_at', e.created_at,
            'confirmed_date', e.confirmed_date,
            'course_id', e.course_id,
            'course_name', c.name,
            'queue_position', public.get_enrollment_queue_position(e.id)
        )
    ), '[]'::jsonb) INTO v_enrollments_data
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.student_id = p_student_id
    ORDER BY e.created_at DESC;

    RETURN v_student_data || jsonb_build_object('enrollments', v_enrollments_data);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Execution grants & revocation of public execution rights

REVOKE EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_students_restricted(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_detail_restricted(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_enrollment_queue_position(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_students_restricted(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_detail_restricted(UUID) TO authenticated;
