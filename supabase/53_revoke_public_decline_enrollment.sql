-- ============================================================
-- Migration 53: Revoke Public Access to Decline Enrollment RPC
-- Security Hardening: Prevent anonymous third parties from
-- revoking student course enrollments without authentication.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) FROM public;

GRANT EXECUTE ON FUNCTION public.public_decline_enrollment(TEXT, UUID, TEXT, UUID) TO authenticated;
