-- ============================================================
-- Migration 41: Viewer Course Access & Completion Approval Workflow
-- ============================================================

-- 1. Add completion request tracking columns to enrollments
ALTER TABLE public.enrollments 
    ADD COLUMN IF NOT EXISTS pending_completion_date DATE,
    ADD COLUMN IF NOT EXISTS completion_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completion_requested_by TEXT,
    ADD COLUMN IF NOT EXISTS completion_request_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS completion_rejection_reason TEXT;

-- Add check constraint for completion_request_status if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_completion_request_status_check'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_completion_request_status_check 
        CHECK (completion_request_status IN ('none', 'pending', 'approved', 'rejected'));
    END IF;
END $$;

-- 2. Add performance index on pending requests
CREATE INDEX IF NOT EXISTS idx_enrollments_completion_pending 
    ON public.enrollments (completion_request_status) 
    WHERE completion_request_status = 'pending';

-- 3. RPC: get_viewer_courses
-- Returns all courses with status aggregation for viewer overview
CREATE OR REPLACE FUNCTION public.get_viewer_courses()
RETURNS TABLE (
    id UUID,
    name TEXT,
    created_at TIMESTAMPTZ,
    total_count BIGINT,
    requested_count BIGINT,
    invited_count BIGINT,
    confirmed_count BIGINT,
    completed_count BIGINT,
    rejected_count BIGINT,
    pending_approval_count BIGINT
) AS $$
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.created_at,
        COUNT(e.id)::BIGINT AS total_count,
        COUNT(e.id) FILTER (WHERE e.status = 'requested')::BIGINT AS requested_count,
        COUNT(e.id) FILTER (WHERE e.status = 'invited')::BIGINT AS invited_count,
        COUNT(e.id) FILTER (WHERE e.status = 'confirmed')::BIGINT AS confirmed_count,
        COUNT(e.id) FILTER (WHERE e.status = 'completed')::BIGINT AS completed_count,
        COUNT(e.id) FILTER (WHERE e.status = 'rejected')::BIGINT AS rejected_count,
        COUNT(e.id) FILTER (WHERE e.completion_request_status = 'pending')::BIGINT AS pending_approval_count
    FROM public.courses c
    LEFT JOIN public.enrollments e ON e.course_id = c.id
    GROUP BY c.id, c.name, c.created_at
    ORDER BY c.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_viewer_courses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_viewer_courses() TO authenticated;

-- 4. RPC: get_viewer_course_roster
-- Returns students in a specific course across statuses with search and status filtering
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
        COALESCE(e.confirmed_date, e.invited_date, e.completed_date) DESC NULLS LAST,
        s.last_name ASC,
        s.first_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_viewer_course_roster(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_viewer_course_roster(UUID, TEXT, TEXT) TO authenticated;

-- 5. RPC: request_course_completion
-- Allows viewers (and authenticated users) to submit completion requests for enrollments
CREATE OR REPLACE FUNCTION public.request_course_completion(
    p_enrollment_ids UUID[],
    p_completed_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_enrollment_ids IS NULL OR array_length(p_enrollment_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No enrollments provided', 'updated_count', 0);
    END IF;

    UPDATE public.enrollments
    SET
        completion_request_status = 'pending',
        pending_completion_date = COALESCE(p_completed_date, confirmed_date, invited_date, CURRENT_DATE),
        completion_requested_at = now(),
        completion_requested_by = COALESCE(auth.jwt() ->> 'email', 'viewer'),
        completion_rejection_reason = NULL,
        updated_at = now()
    WHERE id = ANY(p_enrollment_ids)
      AND status != 'completed';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_count,
        'message', format('Successfully requested completion for %s enrollment(s)', v_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.request_course_completion(UUID[], DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_course_completion(UUID[], DATE) TO authenticated;

-- 6. RPC: approve_course_completion
-- Admin only: approves completion requests and moves enrollment status to 'completed'
CREATE OR REPLACE FUNCTION public.approve_course_completion(
    p_enrollment_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Guard: Viewers cannot approve
    IF coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'viewer' THEN
        RAISE EXCEPTION 'Unauthorized: Viewers cannot approve completion requests';
    END IF;

    IF p_enrollment_ids IS NULL OR array_length(p_enrollment_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No enrollments provided', 'updated_count', 0);
    END IF;

    UPDATE public.enrollments
    SET
        status = 'completed',
        completed_date = COALESCE(pending_completion_date, confirmed_date, invited_date, CURRENT_DATE),
        completed_at = now(),
        completion_request_status = 'approved',
        updated_at = now()
    WHERE id = ANY(p_enrollment_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_count,
        'message', format('Successfully approved completion for %s enrollment(s)', v_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.approve_course_completion(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_course_completion(UUID[]) TO authenticated;

-- 7. RPC: reject_course_completion
-- Admin only: marks completion request as rejected with optional reason
CREATE OR REPLACE FUNCTION public.reject_course_completion(
    p_enrollment_ids UUID[],
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Guard: Viewers cannot reject
    IF coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'viewer' THEN
        RAISE EXCEPTION 'Unauthorized: Viewers cannot reject completion requests';
    END IF;

    IF p_enrollment_ids IS NULL OR array_length(p_enrollment_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No enrollments provided', 'updated_count', 0);
    END IF;

    UPDATE public.enrollments
    SET
        completion_request_status = 'rejected',
        completion_rejection_reason = p_reason,
        updated_at = now()
    WHERE id = ANY(p_enrollment_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_count,
        'message', format('Successfully rejected completion for %s enrollment(s)', v_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reject_course_completion(UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_course_completion(UUID[], TEXT) TO authenticated;

-- 8. RPC: get_pending_completions
-- Fetches pending requests for Admin review
CREATE OR REPLACE FUNCTION public.get_pending_completions()
RETURNS TABLE (
    enrollment_id UUID,
    student_id UUID,
    student_name TEXT,
    student_email TEXT,
    student_phone TEXT,
    course_id UUID,
    course_name TEXT,
    course_variant TEXT,
    confirmed_date DATE,
    pending_completion_date DATE,
    completion_requested_at TIMESTAMPTZ,
    completion_requested_by TEXT
) AS $$
BEGIN
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Guard: Viewers cannot view pending approvals list
    IF coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'viewer' THEN
        RAISE EXCEPTION 'Unauthorized: Viewers cannot access pending approvals list';
    END IF;

    RETURN QUERY
    SELECT
        e.id AS enrollment_id,
        s.id AS student_id,
        (s.first_name || ' ' || s.last_name) AS student_name,
        s.email AS student_email,
        s.phone AS student_phone,
        c.id AS course_id,
        c.name AS course_name,
        e.course_variant,
        e.confirmed_date,
        e.pending_completion_date,
        e.completion_requested_at,
        e.completion_requested_by
    FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.completion_request_status = 'pending'
    ORDER BY e.completion_requested_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_pending_completions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_completions() TO authenticated;

-- 9. Update get_student_detail_restricted to return pending completion info
CREATE OR REPLACE FUNCTION public.get_student_detail_restricted(p_student_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_student_data JSONB;
    v_enrollments_data JSONB;
    v_flags_data JSONB;
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
            'invited_at', e.invited_at,
            'invited_date', e.invited_date,
            'confirmed_at', e.confirmed_at,
            'confirmed_date', e.confirmed_date,
            'completed_at', e.completed_at,
            'completed_date', e.completed_date,
            'pending_completion_date', e.pending_completion_date,
            'completion_request_status', COALESCE(e.completion_request_status, 'none'),
            'completion_requested_at', e.completion_requested_at,
            'completion_requested_by', e.completion_requested_by,
            'completion_rejection_reason', e.completion_rejection_reason,
            'course_id', e.course_id,
            'course_name', c.name,
            'notes', e.notes,
            'is_priority', e.is_priority,
            'queue_position', public.get_enrollment_queue_position(e.id)
        ) ORDER BY e.created_at DESC
    ), '[]'::jsonb) INTO v_enrollments_data
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.student_id = p_student_id;

    -- Student flags (failed courses with comments)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', sf.id,
            'course_id', sf.course_id,
            'course_name', c.name,
            'comment', sf.comment,
            'created_at', sf.created_at
        ) ORDER BY sf.created_at DESC
    ), '[]'::jsonb) INTO v_flags_data
    FROM public.student_flags sf
    JOIN public.courses c ON c.id = sf.course_id
    WHERE sf.student_id = p_student_id;

    RETURN v_student_data || jsonb_build_object(
        'enrollments', v_enrollments_data,
        'flags', v_flags_data
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_student_detail_restricted(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_detail_restricted(UUID) TO authenticated;
