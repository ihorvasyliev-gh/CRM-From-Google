-- ============================================================
-- Migration 72: Drop search_students_restricted
--
-- Only the old Student Lookup screen called it; the viewer portal
-- uses the students directory RPC (migration 54) instead.
-- ============================================================
DROP FUNCTION IF EXISTS public.search_students_restricted(TEXT);
