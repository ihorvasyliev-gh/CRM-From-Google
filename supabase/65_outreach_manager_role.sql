-- ============================================================
-- Migration 65: "outreach" role — manages External Lists only
--
-- A third role next to admin and viewer. An outreach user has full
-- control over External Lists (Outcomes → External lists, e.g.
-- Action 11): create / delete lists, import / add / export people,
-- change their status, send the survey. Nothing else in the CRM.
--
-- Until now every RLS policy and is_app_admin() meant "admin" as
-- "role is not 'viewer'", so any new role would silently have been
-- a full admin. This migration:
--
-- 1. is_app_admin() excludes 'outreach'; new helpers
--    is_outreach_manager() and can_manage_outreach().
-- 2. Rewrites every existing RLS policy that says
--    role <> 'viewer' so it also excludes 'outreach'.
-- 3. outreach_lists / outreach_contacts: admins + outreach users.
--    email_opt_outs: outreach users can read it (surveys skip people
--    who unsubscribed), not change it.
-- 4. outreach_contacts_view.in_crm keeps working for outreach users
--    (they can't read students, so it's computed by a guarded helper).
-- 5. import_outreach_contacts / mark_outreach_contacts_pending:
--    admins + outreach users.
-- 6. API allowlist for outreach users (PostgREST pre-request hook):
--    they can only reach the External Lists tables and RPCs, so the
--    viewer RPCs (student search, rosters, …) are closed to them too.
-- 7. RPC set_user_role(user_id, role): admins switch a user between
--    viewer / outreach, or promote to admin. Admins still can't be
--    demoted. promote_user_to_admin() now also accepts outreach users.
--
-- Role changes reach the user's JWT on the next token refresh
-- (at most ~1 hour, or on re-login).
--
-- NOTE: variables are assigned with ":=" on purpose (see migration 57).
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

-- ------------------------------------------------------------
-- 1. Role helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated'
       AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('viewer', 'outreach');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- Only reads the caller's JWT, so no SECURITY DEFINER. Callable by anon
-- (returns false) because RLS policies on the outreach tables use them.
CREATE OR REPLACE FUNCTION public.is_outreach_manager()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated'
       AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'outreach';
$$ LANGUAGE sql STABLE SET search_path = public;

-- Admins and outreach users
CREATE OR REPLACE FUNCTION public.can_manage_outreach()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated'
       AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'viewer';
$$ LANGUAGE sql STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_outreach_manager() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_outreach() TO anon, authenticated;

-- ------------------------------------------------------------
-- 2. Every "role <> 'viewer'" policy now also excludes 'outreach'
--    (tables in public + the templates bucket in storage).
--    Postgres stores  != 'viewer'  as  <> 'viewer'::text.
-- ------------------------------------------------------------
DO $$
DECLARE
    r       RECORD;
    v_old   TEXT := '<> ''viewer''::text';
    v_new   TEXT := '<> ALL (ARRAY[''viewer''::text, ''outreach''::text])';
    v_sql   TEXT;
    v_count INT := 0;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname IN ('public', 'storage')
          AND (strpos(coalesce(qual, ''), v_old) > 0 OR strpos(coalesce(with_check, ''), v_old) > 0)
    LOOP
        v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        IF r.qual IS NOT NULL THEN
            v_sql := v_sql || ' USING (' || replace(r.qual, v_old, v_new) || ')';
        END IF;
        IF r.with_check IS NOT NULL THEN
            v_sql := v_sql || ' WITH CHECK (' || replace(r.with_check, v_old, v_new) || ')';
        END IF;

        BEGIN
            EXECUTE v_sql;
            v_count := v_count + 1;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE WARNING 'Could not update policy "%" on %.% — edit it by hand so it also excludes the outreach role.',
                r.policyname, r.schemaname, r.tablename;
        END;
    END LOOP;

    RAISE NOTICE 'Updated % policies to exclude the outreach role', v_count;

    -- Fail closed: no table in public may still treat outreach users as admins
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND (strpos(coalesce(qual, ''), v_old) > 0 OR strpos(coalesce(with_check, ''), v_old) > 0)
    ) THEN
        RAISE EXCEPTION 'Migration stopped: some policies in public still only exclude viewers.';
    END IF;
END $$;

-- ------------------------------------------------------------
-- 3. External Lists tables: admins + outreach users
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated access" ON public.outreach_lists;
CREATE POLICY "Authenticated access" ON public.outreach_lists
    FOR ALL USING (public.can_manage_outreach()) WITH CHECK (public.can_manage_outreach());

DROP POLICY IF EXISTS "Authenticated access" ON public.outreach_contacts;
CREATE POLICY "Authenticated access" ON public.outreach_contacts
    FOR ALL USING (public.can_manage_outreach()) WITH CHECK (public.can_manage_outreach());

-- Outreach users only read the unsubscribe list (admins keep full access via "Authenticated access")
DROP POLICY IF EXISTS "Outreach managers read" ON public.email_opt_outs;
CREATE POLICY "Outreach managers read" ON public.email_opt_outs
    FOR SELECT USING (public.is_outreach_manager());

-- ------------------------------------------------------------
-- 4. in_crm without giving outreach users access to students
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.outreach_email_in_crm(p_email TEXT)
RETURNS BOOLEAN AS $$
    SELECT public.can_manage_outreach()
       AND EXISTS (
           SELECT 1 FROM public.students s
           WHERE lower(trim(s.email)) = lower(trim(p_email))
       );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.outreach_email_in_crm(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_email_in_crm(TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.outreach_contacts_view
WITH (security_invoker = on) AS
SELECT
    c.*,
    public.outreach_email_in_crm(c.email) AS in_crm
FROM public.outreach_contacts c;

GRANT SELECT ON public.outreach_contacts_view TO authenticated;

-- ------------------------------------------------------------
-- 5. Outreach RPCs: admins + outreach users (bodies unchanged from migration 61)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_outreach_contacts(p_list_id UUID, p_rows JSONB)
RETURNS JSONB AS $$
DECLARE
    v_inserted INT := 0;
    v_updated  INT := 0;
BEGIN
    IF NOT public.can_manage_outreach() THEN
        RAISE EXCEPTION 'You are not allowed to import contacts' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.mark_outreach_contacts_pending(p_ids UUID[])
RETURNS VOID AS $$
BEGIN
    IF NOT public.can_manage_outreach() THEN
        RAISE EXCEPTION 'You are not allowed to update contacts' USING ERRCODE = '42501';
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
-- 6. API allowlist for outreach users
--    PostgREST calls this before every REST / RPC request. Everyone
--    except outreach users passes straight through. (Realtime and
--    Storage don't go through PostgREST; they are covered by RLS.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restrict_outreach_api_requests()
RETURNS VOID AS $$
DECLARE
    v_path   TEXT;
    v_method TEXT;
BEGIN
    IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'outreach' THEN
        RETURN;
    END IF;

    v_path   := COALESCE(current_setting('request.path', true), '');
    v_method := upper(COALESCE(current_setting('request.method', true), ''));

    IF v_path ~ '^/(outreach_lists|outreach_contacts|outreach_contacts_view|user_settings)/?$'
       OR v_path ~ '^/rpc/(import_outreach_contacts|mark_outreach_contacts_pending)/?$'
       OR (v_path ~ '^/email_opt_outs/?$' AND v_method IN ('GET', 'HEAD')) THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'Your account only has access to External Lists' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.restrict_outreach_api_requests() TO anon, authenticated, service_role;

-- Don't silently replace a pre-request hook someone else configured
DO $$
DECLARE
    v_existing TEXT;
BEGIN
    v_existing := (
        SELECT substring(c FROM '^pgrst\.db_pre_request=(.*)$')
        FROM pg_db_role_setting s
        JOIN pg_roles r ON r.oid = s.setrole
        CROSS JOIN LATERAL unnest(s.setconfig) AS c
        WHERE r.rolname = 'authenticator'
          AND c LIKE 'pgrst.db_pre_request=%'
        LIMIT 1
    );
    IF v_existing IS NOT NULL AND v_existing <> 'public.restrict_outreach_api_requests' THEN
        RAISE EXCEPTION 'authenticator already uses pgrst.db_pre_request = %. Call public.restrict_outreach_api_requests() from it instead.', v_existing;
    END IF;
END $$;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.restrict_outreach_api_requests';
NOTIFY pgrst, 'reload config';

-- ------------------------------------------------------------
-- 7. Role management (admins only)
--    viewer <-> outreach, viewer/outreach -> admin. Admins can't be changed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID AS $$
DECLARE
    v_current TEXT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can change roles' USING ERRCODE = '42501';
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('viewer', 'outreach', 'admin') THEN
        RAISE EXCEPTION 'Unknown role: %', p_role USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
        RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
    END IF;

    -- A missing role has always meant admin (see migration 58)
    v_current := COALESCE(NULLIF((SELECT u.raw_app_meta_data ->> 'role' FROM auth.users u WHERE u.id = p_user_id), ''), 'admin');

    IF v_current NOT IN ('viewer', 'outreach') THEN
        RAISE EXCEPTION 'Admins can''t be changed to another role' USING ERRCODE = '22023';
    END IF;

    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role),
        updated_at = now()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_user_to_admin(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM public.set_user_role(p_user_id, 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.promote_user_to_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(UUID) TO authenticated;
