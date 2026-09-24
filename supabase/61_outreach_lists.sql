-- ============================================================
-- Migration 61: External outreach lists (e.g. Action 11 from IRIS)
--
-- People who are not (necessarily) in the CRM — e.g. clients
-- registered under Action 11 in IRIS — are imported from an
-- Excel/CSV export into a named list and receive the same
-- "how are things going" survey as graduates.
--
-- Their answers are stored here only: employment_status and the
-- graduate statistics are never touched.
--
-- 1. Tables outreach_lists / outreach_contacts (+ RLS, Realtime)
-- 2. View outreach_contacts_view (adds in_crm)
-- 3. RPC import_outreach_contacts(list_id, rows)  — admins
-- 4. RPC mark_outreach_contacts_pending(ids)      — admins
-- 5. RPC submit_outreach_status(...)              — public (/status?list=…)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outreach_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    list_id UUID NOT NULL REFERENCES public.outreach_lists(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    phone TEXT,
    external_ref TEXT,               -- e.g. IRIS participant ID
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'not_contacted'
        CHECK (status IN ('not_contacted', 'pending', 'responded')),
    is_working BOOLEAN,
    started_month TEXT,              -- 'YYYY-MM' format
    field_of_work TEXT,
    employment_type TEXT CHECK (employment_type IN ('full_time', 'part_time')),
    last_invited_at TIMESTAMPTZ,
    last_responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per email per list; re-importing the same export never duplicates people
CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_contacts_list_email
    ON public.outreach_contacts (list_id, lower(trim(email)));

INSERT INTO public.outreach_lists (name) VALUES ('Action 11')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.outreach_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated access" ON public.outreach_lists;
CREATE POLICY "Authenticated access" ON public.outreach_lists
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

DROP POLICY IF EXISTS "Authenticated access" ON public.outreach_contacts;
CREATE POLICY "Authenticated access" ON public.outreach_contacts
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_contacts;

-- ------------------------------------------------------------
-- 2. View: contacts + whether the same email is already a CRM student
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.outreach_contacts_view
WITH (security_invoker = on) AS
SELECT
    c.*,
    EXISTS (
        SELECT 1 FROM public.students s
        WHERE lower(trim(s.email)) = lower(trim(c.email))
    ) AS in_crm
FROM public.outreach_contacts c;

GRANT SELECT ON public.outreach_contacts_view TO authenticated;

-- ------------------------------------------------------------
-- 3. Import rows into a list (safe to re-run with the same file)
--    p_rows: [{first_name, last_name, email, phone, external_ref}, …]
--    New emails are added as 'not_contacted'. Existing ones only get
--    their contact details refreshed (empty cells never erase data);
--    status and answers are never changed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_outreach_contacts(p_list_id UUID, p_rows JSONB)
RETURNS JSONB AS $$
DECLARE
    v_inserted INT := 0;
    v_updated  INT := 0;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can import contacts' USING ERRCODE = '42501';
    END IF;

    WITH incoming AS (
        SELECT DISTINCT ON (lower(trim(r ->> 'email')))
            trim(coalesce(r ->> 'first_name', ''))       AS first_name,
            trim(coalesce(r ->> 'last_name', ''))        AS last_name,
            lower(trim(r ->> 'email'))                   AS email,
            nullif(trim(coalesce(r ->> 'phone', '')), '')        AS phone,
            nullif(trim(coalesce(r ->> 'external_ref', '')), '') AS external_ref
        FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS x(r, n)
        WHERE coalesce(trim(r ->> 'email'), '') <> ''
        ORDER BY lower(trim(r ->> 'email')), n   -- first row of the file wins
    ),
    upserted AS (
        INSERT INTO public.outreach_contacts AS t (list_id, first_name, last_name, email, phone, external_ref)
        SELECT p_list_id, first_name, last_name, email, phone, external_ref FROM incoming
        ON CONFLICT (list_id, lower(trim(email)))
        DO UPDATE SET
            first_name   = coalesce(nullif(EXCLUDED.first_name, ''), t.first_name),
            last_name    = coalesce(nullif(EXCLUDED.last_name, ''), t.last_name),
            phone        = coalesce(EXCLUDED.phone, t.phone),
            external_ref = coalesce(EXCLUDED.external_ref, t.external_ref)
        RETURNING (xmax = 0) AS was_inserted
    )
    SELECT count(*) FILTER (WHERE was_inserted), count(*) FILTER (WHERE NOT was_inserted)
    INTO v_inserted, v_updated
    FROM upserted;

    RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.import_outreach_contacts(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_outreach_contacts(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 4. Mark contacts as invited (same behaviour as graduates)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_outreach_contacts_pending(p_ids UUID[])
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can update contacts' USING ERRCODE = '42501';
    END IF;

    UPDATE public.outreach_contacts
    SET status = 'pending',
        last_invited_at = now()
    WHERE id = ANY(p_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.mark_outreach_contacts_pending(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_outreach_contacts_pending(UUID[]) TO authenticated;

-- ------------------------------------------------------------
-- 5. Public: save an answer from /status?list=<list_id>
--    Only people on that list can answer; nothing outside the list changes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_outreach_status(
    p_list_id         UUID,
    p_email           TEXT,
    p_is_working      BOOLEAN,
    p_started_month   TEXT DEFAULT NULL,
    p_field           TEXT DEFAULT NULL,
    p_employment_type TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_contact_id UUID;
    v_first_name TEXT;
BEGIN
    IF p_employment_type IS NOT NULL AND p_employment_type NOT IN ('full_time', 'part_time') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Please select Full-time or Part-time.');
    END IF;

    SELECT id, first_name INTO v_contact_id, v_first_name
    FROM public.outreach_contacts
    WHERE list_id = p_list_id
      AND lower(trim(email)) = lower(trim(p_email));

    IF v_contact_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'This email address does not match any of our records. Please use the email you originally registered with.');
    END IF;

    UPDATE public.outreach_contacts
    SET is_working        = p_is_working,
        started_month     = p_started_month,
        field_of_work     = p_field,
        employment_type   = p_employment_type,
        status            = 'responded',
        last_responded_at = now()
    WHERE id = v_contact_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Thank you! Your employment status has been updated.',
        'first_name', v_first_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.submit_outreach_status(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_outreach_status(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO anon, authenticated;
