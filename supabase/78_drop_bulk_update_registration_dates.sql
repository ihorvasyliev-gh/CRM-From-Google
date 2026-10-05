-- ============================================================
-- Migration 78: Drop bulk_update_registration_dates()
--
-- A one-off admin utility (schema.sql / update_dates_rpc.sql) that
-- rewrote enrollment and student created_at to the Google Forms
-- submission time. Nothing in the app or the Apps Script calls it any
-- more, yet every signed-in user could execute it: an unused way to
-- rewrite registration dates.
--
-- schema.sql still creates it, because migrations 09, 25 and 26 alter
-- it; on a fresh install this migration then drops it again.
-- To bring it back, run its definition from schema.sql.
-- ============================================================
DROP FUNCTION IF EXISTS public.bulk_update_registration_dates(jsonb);

NOTIFY pgrst, 'reload schema';
