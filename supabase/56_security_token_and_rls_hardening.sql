-- ============================================================
-- Migration 56: Security Hardening (Revoke Anon Read on Confirmation Tokens)
-- Prevents anonymous scraping and enumeration of all active
-- confirmation tokens via direct table SELECT.
-- ============================================================

-- 1. Drop public anon read policy from confirmation_tokens
DROP POLICY IF EXISTS "Anon can read tokens" ON public.confirmation_tokens;

-- Confirmation: anonymous callers can still resolve individual valid tokens via
-- the SECURITY DEFINER function resolve_confirmation_token(p_token), but cannot
-- enumerate or dump the entire confirmation_tokens table.
