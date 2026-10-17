-- ============================================================
-- Migration 83: Access rules read the login once per query
--
-- Most row-level security policies call auth.jwt(), auth.role() or
-- auth.uid() directly. Postgres then evaluates them, and parses the
-- login token, for every row a query reads: with ~10,000 enrollments
-- the board's page query spent two thirds of its time on that.
-- Wrapped as (SELECT auth.jwt()) the call runs once per query (an
-- "initPlan"), as Supabase recommends ("Auth RLS Initialization Plan"
-- in the Performance Advisor). Who may see or change what is unchanged:
-- the expressions are the same, only evaluated once.
--
-- Every policy on a table in the public schema is rewritten in place
-- (ALTER POLICY keeps its name, command and roles). Policies added by
-- later migrations should use (SELECT auth.…()) directly.
--
-- Safe to run more than once: calls already wrapped are left alone.
-- This file creates no tables: if the RLS warning appears, choose
-- "Run without RLS".
-- ============================================================

DO $$
DECLARE
    p RECORD;
    -- auth.jwt() / auth.role() / auth.uid() not already inside "(SELECT …)"
    bare CONSTANT TEXT := '(?<!SELECT )auth\.(jwt|role|uid)\(\)';
    wrapped CONSTANT TEXT := '(SELECT auth.\1())';
    new_qual TEXT;
    new_check TEXT;
    stmt TEXT;
BEGIN
    FOR p IN
        SELECT schemaname, tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (qual ~ bare OR with_check ~ bare)
    LOOP
        new_qual := regexp_replace(p.qual, bare, wrapped, 'g');
        new_check := regexp_replace(p.with_check, bare, wrapped, 'g');
        stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
        IF new_qual IS NOT NULL THEN
            stmt := stmt || format(' USING (%s)', new_qual);
        END IF;
        IF new_check IS NOT NULL THEN
            stmt := stmt || format(' WITH CHECK (%s)', new_check);
        END IF;
        EXECUTE stmt;
        RAISE NOTICE 'Rewrote policy "%" on %', p.policyname, p.tablename;
    END LOOP;
END $$;
