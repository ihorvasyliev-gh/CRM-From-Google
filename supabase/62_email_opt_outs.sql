-- ============================================================
-- Migration 62: Email opt-outs (unsubscribe list)
--
-- People who asked not to be emailed any more. An email on this
-- list is left out of every mailing (course invitations, outcome
-- surveys, outreach lists), but the student / contact records stay
-- in the database untouched.
--
-- The list is keyed by email (lower-cased), so it covers CRM
-- students and external outreach contacts alike.
--
-- Re-subscribing: when the same email registers again through the
-- Google Form, the Apps Script sync deletes the opt-out if the form
-- submission is newer than opted_out_at (see Code.gs).
--
-- 1. Table email_opt_outs (+ RLS)
-- 2. RPC opt_out_email(email, note)   — admins
-- 3. RPC opt_in_email(email)          — admins
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_opt_outs (
    email TEXT PRIMARY KEY CHECK (email = lower(trim(email)) AND email <> ''),
    note TEXT,
    opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID DEFAULT auth.uid()
);

ALTER TABLE public.email_opt_outs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated access" ON public.email_opt_outs;
CREATE POLICY "Authenticated access" ON public.email_opt_outs
    FOR ALL USING (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    ) WITH CHECK (
        auth.role() = 'authenticated' AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- ------------------------------------------------------------
-- 2. Opt an email out (idempotent; re-adding refreshes the date)
--    Returns how many CRM students / outreach contacts use it.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.opt_out_email(p_email TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_email    TEXT := lower(trim(coalesce(p_email, '')));
    v_students INT;
    v_contacts INT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can manage unsubscribes' USING ERRCODE = '42501';
    END IF;
    IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
        RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.email_opt_outs (email, note, opted_out_at, created_by)
    VALUES (v_email, nullif(trim(coalesce(p_note, '')), ''), now(), auth.uid())
    ON CONFLICT (email) DO UPDATE SET
        note         = coalesce(EXCLUDED.note, public.email_opt_outs.note),
        opted_out_at = now(),
        created_by   = EXCLUDED.created_by;

    SELECT count(*) INTO v_students FROM public.students WHERE lower(trim(email)) = v_email;
    SELECT count(*) INTO v_contacts FROM public.outreach_contacts WHERE lower(trim(email)) = v_email;

    RETURN jsonb_build_object('email', v_email, 'students', v_students, 'contacts', v_contacts);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.opt_out_email(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opt_out_email(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 3. Turn emails back on for an address
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.opt_in_email(p_email TEXT)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can manage unsubscribes' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.email_opt_outs WHERE email = lower(trim(coalesce(p_email, '')));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.opt_in_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opt_in_email(TEXT) TO authenticated;
