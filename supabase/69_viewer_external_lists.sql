-- ============================================================
-- Migration 69: viewers also manage External Lists
--
-- Viewers get everything the "outreach" role has (migration 65):
-- Outcomes → External lists only, full control. Graduate outcomes
-- and the rest of the admin CRM stay closed to them.
--
-- 1. can_manage_outreach(): admins, outreach users and viewers.
-- 2. is_outreach_manager(): also viewers, so they can read the
--    unsubscribe list (surveys skip people who opted out).
--
-- The outreach API allowlist (restrict_outreach_api_requests) only
-- applies to role 'outreach', so viewers keep their viewer RPCs.
-- Needs migration 65.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_manage_outreach()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated';
$$ LANGUAGE sql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_outreach_manager()
RETURNS BOOLEAN AS $$
    SELECT auth.role() = 'authenticated'
       AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('outreach', 'viewer');
$$ LANGUAGE sql STABLE SET search_path = public;
