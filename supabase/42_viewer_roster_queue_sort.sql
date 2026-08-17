-- ============================================================
-- Migration 42: Viewer Course Roster Queue Sorting
-- Ensures students in course roster for Viewer are ordered by queue:
-- Priority first (is_priority DESC), then registration date (created_at ASC)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_viewer_course_roster(
    p_course_id UUID,
    p_status TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
    enrollment_id UUID,
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT,
    course_variant TEXT,
    notes TEXT,
    is_priority BOOLEAN,
    queue_position INTEGER,
    invited_date DATE,
    invited_at TIMESTAMPTZ,
    confirmed_date DATE,
    confirmed_at TIMESTAMPTZ,
    completed_date DATE,
    completed_at TIMESTAMPTZ,
    pending_completion_date DATE,
    completion_request_status TEXT,
    completion_requested_at TIMESTAMPTZ,
    completion_requested_by TEXT,
    completion_rejection_reason TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT
        e.id AS enrollment_id,
        s.id AS student_id,
        s.first_name,
        s.last_name,
        s.email,
        s.phone,
        e.status,
        e.course_variant,
        e.notes,
        e.is_priority,
        CASE WHEN e.status = 'requested' THEN public.get_enrollment_queue_position(e.id) ELSE NULL END AS queue_position,
        e.invited_date,
        e.invited_at,
        e.confirmed_date,
        e.confirmed_at,
        e.completed_date,
        e.completed_at,
        e.pending_completion_date,
        COALESCE(e.completion_request_status, 'none') AS completion_request_status,
        e.completion_requested_at,
        e.completion_requested_by,
        e.completion_rejection_reason,
        e.created_at
    FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    WHERE e.course_id = p_course_id
      AND (p_status IS NULL OR p_status = '' OR p_status = 'all' OR e.status = p_status)
      AND (
          p_search IS NULL OR p_search = '' OR
          (s.first_name || ' ' || s.last_name) ILIKE '%' || p_search || '%' OR
          s.email ILIKE '%' || p_search || '%' OR
          s.phone ILIKE '%' || p_search || '%'
      )
    ORDER BY
        CASE 
            WHEN e.completion_request_status = 'pending' THEN 0
            WHEN e.status = 'confirmed' THEN 1
            WHEN e.status = 'invited' THEN 2
            WHEN e.status = 'requested' THEN 3
            WHEN e.status = 'completed' THEN 4
            ELSE 5 
        END,
        e.is_priority DESC,
        e.created_at ASC,
        s.last_name ASC,
        s.first_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_viewer_course_roster(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_viewer_course_roster(UUID, TEXT, TEXT) TO authenticated;
