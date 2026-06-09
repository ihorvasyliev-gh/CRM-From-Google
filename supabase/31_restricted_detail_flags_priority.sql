-- ============================================================
-- Migration 31: Add notes, is_priority, and student_flags
--               to get_student_detail_restricted RPC
-- ============================================================

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
