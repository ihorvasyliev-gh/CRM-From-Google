-- ============================================================
-- Migration 37: Fix Restricted Student Search Functionality
-- ============================================================
-- Fixes:
-- 1. Three-valued NULL boolean logic bug: COALESCE all fields so students
--    with NULL email/phone/address do not falsely match all queries via NOT EXISTS.
-- 2. Irish phone number matching: Handles local 08x format against international +3538x,
--    and strips spaces/formatting (+, -, spaces) for digit-based search.
-- 3. Address and full name matching: Allows searching by address and combined name.
-- 4. Multiple whitespace handling: Uses regexp_split_to_table instead of string_to_array.
-- 5. Smart relevance sorting: Exact/prefix name matches appear at top of results.
-- ============================================================

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

    IF length(v_clean_query) < 3 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        s.id, 
        s.first_name, 
        s.last_name, 
        s.email, 
        s.phone, 
        s.address, 
        s.eircode, 
        s.dob, 
        s.created_at
    FROM public.students s
    WHERE NOT EXISTS (
        -- Find if any search term fails to match the student
        SELECT 1
        FROM regexp_split_to_table(v_clean_query, '\s+') AS term
        WHERE length(trim(term)) > 0
          AND NOT (
              -- First name or Last name matching
              COALESCE(s.first_name, '') ILIKE '%' || term || '%' OR
              COALESCE(s.last_name, '') ILIKE '%' || term || '%' OR
              
              -- Combined Full Name matching (e.g. "Mahad Hirsi")
              (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) ILIKE '%' || term || '%' OR
              
              -- Email matching
              COALESCE(s.email, '') ILIKE '%' || term || '%' OR
              
              -- Address matching
              COALESCE(s.address, '') ILIKE '%' || term || '%' OR
              
              -- Eircode matching (stripped spaces)
              COALESCE(s.normalized_eircode, upper(replace(COALESCE(s.eircode, ''), ' ', ''))) ILIKE '%' || upper(replace(term, ' ', '')) || '%' OR
              
              -- Phone matching: raw substring
              COALESCE(s.phone, '') ILIKE '%' || term || '%' OR
              
              -- Phone matching: normalized digits (handles +353, 08x, dashes, brackets, spaces)
              (
                  length(regexp_replace(term, '\D', '', 'g')) >= 2 AND (
                      -- Match raw digits directly
                      regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%' || regexp_replace(term, '\D', '', 'g') || '%'
                      OR
                      -- Match Irish national format: leading 0 stripped (e.g. '087' matches '35387...')
                      (
                          regexp_replace(term, '\D', '', 'g') LIKE '0%' AND
                          regexp_replace(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%' || substr(regexp_replace(term, '\D', '', 'g'), 2) || '%'
                      )
                  )
              )
          )
    )
    ORDER BY 
        -- Relevance score: exact / prefix name matches first
        CASE 
            WHEN (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) ILIKE v_clean_query || '%' THEN 1
            WHEN (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) ILIKE '%' || v_clean_query || '%' THEN 2
            WHEN COALESCE(s.email, '') ILIKE v_clean_query || '%' THEN 3
            ELSE 4
        END,
        s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke execute from PUBLIC and grant to authenticated users
REVOKE EXECUTE ON FUNCTION public.search_students_restricted(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_students_restricted(TEXT) TO authenticated;
