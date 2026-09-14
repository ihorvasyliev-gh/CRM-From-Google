-- ============================================================
-- Migration 54: Viewer Students Directory RPC
-- Provides high-performance, secure read-only student directory
-- for the Viewer Portal (Curators and Case Managers).
--
-- Features:
-- 1. Multi-token search across first_name, last_name, full name,
--    email, phone (normalized Irish & international), address, eircode.
-- 2. Multi-attribute filtering by course, enrollment status, and priority.
-- 3. Deterministic primary enrollment computation with active pipeline ranking.
-- 4. Queue position calculation for requested enrollments via get_enrollment_queue_position.
-- 5. Aggregate metrics: total_enrollments, notes_count (flags + enrollment notes).
-- 6. Flexible sorting: date_desc, date_asc, queue (priority & position), name_asc.
-- 7. Windowed total_count for seamless client pagination (LIMIT / OFFSET).
-- 8. SECURITY DEFINER with authenticated role enforcement.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_viewer_students_directory(
    p_search TEXT DEFAULT NULL,
    p_course_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_priority_only BOOLEAN DEFAULT FALSE,
    p_sort_by TEXT DEFAULT 'date_desc',
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    eircode TEXT,
    dob DATE,
    created_at TIMESTAMPTZ,
    primary_course_name TEXT,
    primary_course_id UUID,
    primary_status TEXT,
    primary_course_variant TEXT,
    primary_queue_position INT,
    is_priority BOOLEAN,
    total_enrollments INT,
    notes_count INT,
    total_count BIGINT
) AS $$
DECLARE
    v_clean_search TEXT := trim(p_search);
    v_status TEXT := lower(trim(p_status));
    v_sort_by TEXT := lower(trim(p_sort_by));
    v_limit INT := GREATEST(1, COALESCE(p_limit, 50));
    v_offset INT := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
    -- Security guard: require authenticated caller
    IF auth.role() != 'authenticated' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    WITH filtered_students AS (
        SELECT 
            s.id AS f_student_id,
            s.first_name AS f_first_name,
            s.last_name AS f_last_name,
            s.email AS f_email,
            s.phone AS f_phone,
            s.address AS f_address,
            s.eircode AS f_eircode,
            s.dob AS f_dob,
            s.created_at AS f_created_at
        FROM public.students s
        WHERE (
            -- 1. Multi-token search across name, email, phone, address, eircode
            v_clean_search IS NULL OR v_clean_search = '' OR
            NOT EXISTS (
                SELECT 1
                FROM regexp_split_to_table(v_clean_search, '\s+') AS term
                WHERE length(trim(term)) > 0
                  AND NOT (
                      COALESCE(s.first_name, '') ILIKE '%' || term || '%' OR
                      COALESCE(s.last_name, '') ILIKE '%' || term || '%' OR
                      (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) ILIKE '%' || term || '%' OR
                      COALESCE(s.email, '') ILIKE '%' || term || '%' OR
                      COALESCE(s.address, '') ILIKE '%' || term || '%' OR
                      COALESCE(s.normalized_eircode, upper(replace(COALESCE(s.eircode, ''), ' ', ''))) ILIKE '%' || upper(replace(term, ' ', '')) || '%' OR
                      COALESCE(s.phone, '') ILIKE '%' || term || '%' OR
                      (
                          length(regexp_replace(term, '\D', '', 'g')) >= 2 AND (
                              regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%' || regexp_replace(term, '\D', '', 'g') || '%'
                              OR
                              (
                                  regexp_replace(term, '\D', '', 'g') LIKE '0%' AND
                                  regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%' || substr(regexp_replace(term, '\D', '', 'g'), 2) || '%'
                              )
                          )
                      )
                  )
            )
        )
        AND (
            -- 2. Course, status, and priority filtering
            (
                p_course_id IS NULL 
                AND (v_status IS NULL OR v_status = '' OR v_status = 'all') 
                AND NOT COALESCE(p_priority_only, FALSE)
            )
            OR EXISTS (
                SELECT 1 
                FROM public.enrollments fe
                WHERE fe.student_id = s.id
                  AND (p_course_id IS NULL OR fe.course_id = p_course_id)
                  AND (v_status IS NULL OR v_status = '' OR v_status = 'all' OR fe.status = v_status)
                  AND (NOT COALESCE(p_priority_only, FALSE) OR fe.is_priority = TRUE)
            )
        )
    )
    SELECT
        fs.f_student_id AS student_id,
        fs.f_first_name AS first_name,
        fs.f_last_name AS last_name,
        fs.f_email AS email,
        fs.f_phone AS phone,
        fs.f_address AS address,
        fs.f_eircode AS eircode,
        fs.f_dob AS dob,
        fs.f_created_at AS created_at,
        pe.course_name AS primary_course_name,
        pe.course_id AS primary_course_id,
        pe.status AS primary_status,
        pe.course_variant AS primary_course_variant,
        pe.queue_position AS primary_queue_position,
        COALESCE(pe.is_priority, FALSE) AS is_priority,
        COALESCE((
            SELECT COUNT(*)::INT 
            FROM public.enrollments te 
            WHERE te.student_id = fs.f_student_id
        ), 0) AS total_enrollments,
        COALESCE((
            SELECT (
                (SELECT COUNT(*) FROM public.student_flags sf WHERE sf.student_id = fs.f_student_id)
                +
                (SELECT COUNT(*) FROM public.enrollments en WHERE en.student_id = fs.f_student_id AND en.notes IS NOT NULL AND trim(en.notes) != '')
            )::INT
        ), 0) AS notes_count,
        COUNT(*) OVER()::BIGINT AS total_count
    FROM filtered_students fs
    LEFT JOIN LATERAL (
        SELECT 
            e.id AS enrollment_id,
            e.course_id,
            c.name AS course_name,
            e.status,
            e.course_variant,
            e.is_priority,
            CASE 
                WHEN e.status = 'requested' THEN public.get_enrollment_queue_position(e.id)
                ELSE NULL 
            END AS queue_position
        FROM public.enrollments e
        JOIN public.courses c ON c.id = e.course_id
        WHERE e.student_id = fs.f_student_id
        ORDER BY 
            -- Prioritize enrollment matching user filters if active
            CASE WHEN p_course_id IS NOT NULL AND e.course_id = p_course_id THEN 0 ELSE 1 END,
            CASE WHEN v_status IS NOT NULL AND v_status != '' AND v_status != 'all' AND e.status = v_status THEN 0 ELSE 1 END,
            CASE WHEN e.is_priority = TRUE THEN 0 ELSE 1 END,
            -- Active pipeline statuses prioritized over completed or withdrawn
            CASE 
                WHEN e.completion_request_status = 'pending' THEN 0
                WHEN e.status = 'confirmed' THEN 1
                WHEN e.status = 'invited' THEN 2
                WHEN e.status = 'requested' THEN 3
                WHEN e.status = 'completed' THEN 4
                ELSE 5 
            END,
            e.created_at DESC,
            e.id ASC
        LIMIT 1
    ) pe ON true
    ORDER BY
        -- 1. Newest registration first (default: date_desc)
        CASE 
            WHEN v_sort_by = 'date_asc' THEN NULL
            WHEN v_sort_by = 'name_asc' THEN NULL
            WHEN v_sort_by = 'queue' THEN NULL
            ELSE fs.f_created_at
        END DESC NULLS LAST,

        -- 2. Oldest registration first (date_asc)
        CASE 
            WHEN v_sort_by = 'date_asc' THEN fs.f_created_at
            ELSE NULL
        END ASC NULLS LAST,

        -- 3. Student Name A-Z (name_asc)
        CASE 
            WHEN v_sort_by = 'name_asc' THEN COALESCE(fs.f_last_name, '')
            ELSE NULL
        END ASC NULLS LAST,
        CASE 
            WHEN v_sort_by = 'name_asc' THEN COALESCE(fs.f_first_name, '')
            ELSE NULL
        END ASC NULLS LAST,

        -- 4. Queue Position / Priority (queue)
        CASE 
            WHEN v_sort_by = 'queue' AND COALESCE(pe.is_priority, FALSE) THEN 0
            WHEN v_sort_by = 'queue' THEN 1
            ELSE NULL
        END ASC NULLS LAST,
        CASE 
            WHEN v_sort_by = 'queue' AND pe.status = 'requested' THEN 0
            WHEN v_sort_by = 'queue' THEN 1
            ELSE NULL
        END ASC NULLS LAST,
        CASE 
            WHEN v_sort_by = 'queue' THEN pe.queue_position
            ELSE NULL
        END ASC NULLS LAST,
        CASE 
            WHEN v_sort_by = 'queue' AND pe.status = 'confirmed' THEN 1
            WHEN v_sort_by = 'queue' AND pe.status = 'invited' THEN 2
            WHEN v_sort_by = 'queue' AND pe.status = 'completed' THEN 3
            WHEN v_sort_by = 'queue' THEN 4
            ELSE NULL
        END ASC NULLS LAST,
        CASE 
            WHEN v_sort_by = 'queue' THEN fs.f_created_at
            ELSE NULL
        END ASC NULLS LAST,

        -- Deterministic tie-breakers for stable pagination
        fs.f_last_name ASC NULLS LAST,
        fs.f_first_name ASC NULLS LAST,
        fs.f_student_id ASC
    LIMIT v_limit OFFSET v_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke execute from PUBLIC and grant to authenticated users
REVOKE EXECUTE ON FUNCTION public.get_viewer_students_directory(TEXT, UUID, TEXT, BOOLEAN, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_viewer_students_directory(TEXT, UUID, TEXT, BOOLEAN, TEXT, INT, INT) TO authenticated;
