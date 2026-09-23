-- ============================================================
-- Migration 58: New users are viewers by default + admin-only promotion
--
-- 1. Backfill: every EXISTING user without an explicit role gets
--    role = 'admin' (a missing role has always meant full access), so
--    nobody's current access changes. Existing viewers stay viewers.
-- 2. Trigger: every NEW auth user gets app_metadata.role = 'viewer'
--    unless a role was set explicitly at creation time.
-- 3. RPC list_app_users(): admins see all users with their role.
-- 4. RPC promote_user_to_admin(user_id): admins can turn a viewer into
--    an admin. There is intentionally NO way to demote an admin.
--
-- Role changes are stored in auth.users.raw_app_meta_data and reach the
-- user's JWT on their next token refresh (at most ~1 hour, or on re-login).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Backfill existing users (keep their current effective role)
-- ------------------------------------------------------------
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
WHERE COALESCE(raw_app_meta_data ->> 'role', '') = '';

-- ------------------------------------------------------------
-- 2. Default role for new users
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_default_viewer_role()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(NEW.raw_app_meta_data ->> 'role', '') = '' THEN
        NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'viewer');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS on_auth_user_default_role ON auth.users;
CREATE TRIGGER on_auth_user_default_role
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.set_default_viewer_role();

REVOKE EXECUTE ON FUNCTION public.set_default_viewer_role() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Helper: is the caller an admin? (same rule as the RLS policies: not a viewer)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated'
       AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'viewer';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- ------------------------------------------------------------
-- 3. List users (admins only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_app_users()
RETURNS TABLE (
    id UUID,
    email TEXT,
    role TEXT,
    created_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ
) AS $$
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can view users' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::TEXT,
        COALESCE(NULLIF(u.raw_app_meta_data ->> 'role', ''), 'admin')::TEXT AS role,
        u.created_at,
        u.last_sign_in_at
    FROM auth.users u
    WHERE u.deleted_at IS NULL
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.list_app_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_app_users() TO authenticated;

-- ------------------------------------------------------------
-- 4. Promote viewer -> admin (one-way)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_user_to_admin(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT public.is_app_admin() THEN
        RAISE EXCEPTION 'Only admins can change roles' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
        RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
    END IF;

    v_role := (SELECT u.raw_app_meta_data ->> 'role' FROM auth.users u WHERE u.id = p_user_id);

    IF COALESCE(v_role, '') <> 'viewer' THEN
        RAISE EXCEPTION 'Only viewers can be promoted to admin' USING ERRCODE = '22023';
    END IF;

    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin'),
        updated_at = now()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.promote_user_to_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(UUID) TO authenticated;
