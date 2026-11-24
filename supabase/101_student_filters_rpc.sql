-- ============================================================
-- Migration 101: Server-side Filtered & Sorted Admin Students
--                Pagination RPC
--
-- Replaces full-table client downloads when filtering by course,
-- enrollment status, or "no courses", or when sorting by course
-- count on the Admin Students page.
--
--   * Admin-only guard via public.is_app_admin() (42501).
--   * Caps p_limit to [1, 200] and p_offset >= 0.
--   * Multi-word search across first_name, last_name, email,
--     phone (including phone-digit matching with optional leading
--     zero), address, and eircode / normalized_eircode, escaping
--     LIKE wildcards (%, _, \) with ESCAPE '\'.
--   * Enrollment filters matching frontend StudentFilters:
--       - p_no_courses = TRUE: students with zero enrollments.
--       - p_course_id / p_status: students with an enrollment
--         matching both supplied criteria.
--   * Sort keys: 'created_at', 'name', 'phone', 'eircode',
--     'courses' in 'asc' or 'desc' order, with empty/null phone
--     and eircode always sorted last and deterministic
--     (created_at DESC, id ASC) tie-breakers.
--   * Returns exact total_count via COUNT(*) OVER().
--
-- Safe to run more than once (idempotent).
-- This file creates no tables: if the RLS warning appears,
-- choose "Run without RLS".
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_students_page(
    p_search     TEXT    DEFAULT '',
    p_course_id  UUID    DEFAULT NULL,
    p_status     TEXT    DEFAULT NULL,
    p_no_courses BOOLEAN DEFAULT FALSE,
    p_sort_key   TEXT    DEFAULT 'created_at',
    p_sort_dir   TEXT    DEFAULT 'desc',
    p_limit      INT     DEFAULT 30,
    p_offset     INT     DEFAULT 0
)
RETURNS TABLE (
    id          UUID,
    first_name  TEXT,
    last_name   TEXT,
    email       TEXT,
    phone       TEXT,
    address     TEXT,
    eircode     TEXT,
    dob         DATE,
    created_at  TIMESTAMPTZ,
    total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_search TEXT    := NULLIF(btrim(COALESCE(p_search, '')), '');
    v_status       TEXT    := NULLIF(NULLIF(lower(btrim(COALESCE(p_status, ''))), ''), 'all');
    v_no_courses   BOOLEAN := COALESCE(p_no_courses, FALSE);
    v_sort_key     TEXT    := lower(btrim(COALESCE(p_sort_key, 'created_at')));
    v_sort_dir     TEXT    := CASE WHEN lower(btrim(COALESCE(p_sort_dir, 'desc'))) = 'asc' THEN 'asc' ELSE 'desc' END;
    v_limit        INT     := LEAST(200, GREATEST(1, COALESCE(p_limit, 30)));
    v_offset       INT     := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can list students' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH search_terms AS (
        SELECT
            raw_term,
            replace(replace(replace(raw_term, '\', '\\'), '%', '\%'), '_', '\_') AS escaped_term,
            replace(replace(replace(upper(replace(raw_term, ' ', '')), '\', '\\'), '%', '\%'), '_', '\_') AS escaped_eircode,
            (raw_term ~ '^[0-9+().-]+$') AS is_phone_like,
            regexp_replace(raw_term, '\D', '', 'g') AS digits
        FROM (
            SELECT btrim(t) AS raw_term
            FROM regexp_split_to_table(COALESCE(v_clean_search, ''), '\s+') AS t
            WHERE length(btrim(t)) > 0
        ) raw_split
    ),
    filtered_students AS (
        SELECT
            s.id         AS f_id,
            s.first_name AS f_first_name,
            s.last_name  AS f_last_name,
            s.email      AS f_email,
            s.phone      AS f_phone,
            s.address    AS f_address,
            s.eircode    AS f_eircode,
            s.dob        AS f_dob,
            s.created_at AS f_created_at
        FROM public.students s
        WHERE (
            v_clean_search IS NULL
            OR NOT EXISTS (
                SELECT 1
                FROM search_terms st
                WHERE NOT (
                    COALESCE(s.first_name, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\'
                    OR COALESCE(s.last_name, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\'
                    OR (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) ILIKE '%' || st.escaped_term || '%' ESCAPE '\'
                    OR COALESCE(s.email, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\'
                    OR COALESCE(s.address, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\'
                    OR COALESCE(s.eircode, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\'
                    OR COALESCE(s.normalized_eircode, upper(replace(COALESCE(s.eircode, ''), ' ', ''))) ILIKE '%' || st.escaped_eircode || '%' ESCAPE '\'
                    OR COALESCE(s.phone, '') ILIKE '%' || st.escaped_term || '%' ESCAPE '\'
                    OR (
                        st.is_phone_like
                        AND length(st.digits) >= 3
                        AND (
                            regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%' || st.digits || '%'
                            OR (
                                st.digits LIKE '0%'
                                AND regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%' || substr(st.digits, 2) || '%'
                            )
                        )
                    )
                )
            )
        )
        AND (
            CASE
                WHEN v_no_courses THEN
                    NOT EXISTS (
                        SELECT 1
                        FROM public.enrollments e
                        WHERE e.student_id = s.id
                    )
                WHEN p_course_id IS NOT NULL OR v_status IS NOT NULL THEN
                    EXISTS (
                        SELECT 1
                        FROM public.enrollments e
                        WHERE e.student_id = s.id
                          AND (p_course_id IS NULL OR e.course_id = p_course_id)
                          AND (v_status IS NULL OR e.status = v_status)
                    )
                ELSE TRUE
            END
        )
    ),
    enrollment_counts AS (
        SELECT
            e.student_id AS ec_student_id,
            COUNT(*)::INT AS course_count
        FROM public.enrollments e
        WHERE v_sort_key = 'courses'
          AND e.student_id IN (SELECT fs_sub.f_id FROM filtered_students fs_sub)
        GROUP BY e.student_id
    )
    SELECT
        fs.f_id                      AS id,
        fs.f_first_name              AS first_name,
        fs.f_last_name               AS last_name,
        fs.f_email                   AS email,
        fs.f_phone                   AS phone,
        fs.f_address                 AS address,
        fs.f_eircode                 AS eircode,
        fs.f_dob                     AS dob,
        fs.f_created_at              AS created_at,
        COUNT(*) OVER()::BIGINT      AS total_count
    FROM filtered_students fs
    LEFT JOIN enrollment_counts ec ON ec.ec_student_id = fs.f_id
    ORDER BY
        -- Empty/null phone & eircode ALWAYS sort last regardless of direction
        CASE WHEN v_sort_key = 'phone'   THEN (NULLIF(btrim(fs.f_phone), '') IS NULL)   END ASC NULLS LAST,
        CASE WHEN v_sort_key = 'eircode' THEN (NULLIF(btrim(fs.f_eircode), '') IS NULL) END ASC NULLS LAST,

        -- Primary sort (ASC)
        CASE WHEN v_sort_key = 'name'    AND v_sort_dir = 'asc'  THEN lower(btrim(COALESCE(fs.f_first_name, '') || ' ' || COALESCE(fs.f_last_name, ''))) END ASC NULLS LAST,
        CASE WHEN v_sort_key = 'phone'   AND v_sort_dir = 'asc'  THEN lower(NULLIF(btrim(fs.f_phone), '')) END ASC NULLS LAST,
        CASE WHEN v_sort_key = 'eircode' AND v_sort_dir = 'asc'  THEN lower(NULLIF(btrim(fs.f_eircode), '')) END ASC NULLS LAST,
        CASE WHEN v_sort_key = 'courses' AND v_sort_dir = 'asc'  THEN COALESCE(ec.course_count, 0) END ASC NULLS LAST,
        CASE WHEN v_sort_key NOT IN ('name', 'phone', 'eircode', 'courses') AND v_sort_dir = 'asc' THEN fs.f_created_at END ASC NULLS LAST,

        -- Primary sort (DESC)
        CASE WHEN v_sort_key = 'name'    AND v_sort_dir = 'desc' THEN lower(btrim(COALESCE(fs.f_first_name, '') || ' ' || COALESCE(fs.f_last_name, ''))) END DESC NULLS LAST,
        CASE WHEN v_sort_key = 'phone'   AND v_sort_dir = 'desc' THEN lower(NULLIF(btrim(fs.f_phone), '')) END DESC NULLS LAST,
        CASE WHEN v_sort_key = 'eircode' AND v_sort_dir = 'desc' THEN lower(NULLIF(btrim(fs.f_eircode), '')) END DESC NULLS LAST,
        CASE WHEN v_sort_key = 'courses' AND v_sort_dir = 'desc' THEN COALESCE(ec.course_count, 0) END DESC NULLS LAST,
        CASE WHEN v_sort_key NOT IN ('name', 'phone', 'eircode', 'courses') AND v_sort_dir = 'desc' THEN fs.f_created_at END DESC NULLS LAST,

        -- Deterministic tie-breakers
        fs.f_created_at DESC NULLS LAST,
        fs.f_id ASC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_students_page(TEXT, UUID, TEXT, BOOLEAN, TEXT, TEXT, INT, INT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_students_page(TEXT, UUID, TEXT, BOOLEAN, TEXT, TEXT, INT, INT)
    TO authenticated;

NOTIFY pgrst, 'reload schema';
