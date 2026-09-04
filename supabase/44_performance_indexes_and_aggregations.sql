-- ============================================================
-- Migration 44: Performance Indexes & Enrollment Counts RPC
-- ============================================================

-- 1. Performance Indexes for high-cardinality status & timestamp lookups
CREATE INDEX IF NOT EXISTS idx_enrollments_status 
    ON public.enrollments (status);

CREATE INDEX IF NOT EXISTS idx_enrollments_created_at 
    ON public.enrollments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_students_created_at 
    ON public.students (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_course_status 
    ON public.enrollments (course_id, status);

-- 2. Aggregated Enrollment Counts RPC
-- Replaces client-side fetching of all enrollment records with an indexed database aggregation.
CREATE OR REPLACE FUNCTION public.get_course_enrollment_counts()
RETURNS TABLE (
    course_id UUID,
    total BIGINT,
    requested BIGINT,
    invited BIGINT,
    confirmed BIGINT,
    completed BIGINT,
    withdrawn BIGINT,
    rejected BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT
        e.course_id,
        COUNT(e.id)::BIGINT AS total,
        COUNT(e.id) FILTER (WHERE e.status = 'requested')::BIGINT AS requested,
        COUNT(e.id) FILTER (WHERE e.status = 'invited')::BIGINT AS invited,
        COUNT(e.id) FILTER (WHERE e.status = 'confirmed')::BIGINT AS confirmed,
        COUNT(e.id) FILTER (WHERE e.status = 'completed')::BIGINT AS completed,
        COUNT(e.id) FILTER (WHERE e.status = 'withdrawn')::BIGINT AS withdrawn,
        COUNT(e.id) FILTER (WHERE e.status = 'rejected')::BIGINT AS rejected
    FROM public.enrollments e
    GROUP BY e.course_id;
END;
$$;

-- 3. Permissions
REVOKE ALL ON FUNCTION public.get_course_enrollment_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_course_enrollment_counts() TO authenticated;
