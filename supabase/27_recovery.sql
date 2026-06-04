-- ============================================================
-- Migration 27: RLS and Privileges Recovery
-- ============================================================

-- 1. Recreate RLS policies for all tables to ensure they match schema.sql
-- Drop old policies to avoid conflicts, then recreate them.

-- Students
DROP POLICY IF EXISTS "Authenticated access" ON public.students;
CREATE POLICY "Authenticated access" ON public.students
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Courses
DROP POLICY IF EXISTS "Authenticated access" ON public.courses;
CREATE POLICY "Authenticated access" ON public.courses
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Enrollments
DROP POLICY IF EXISTS "Authenticated access" ON public.enrollments;
CREATE POLICY "Authenticated access" ON public.enrollments
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Invite Dates
DROP POLICY IF EXISTS "Authenticated access" ON public.invite_dates;
CREATE POLICY "Authenticated access" ON public.invite_dates
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Document Templates
DROP POLICY IF EXISTS "Authenticated access" ON public.document_templates;
CREATE POLICY "Authenticated access" ON public.document_templates
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Attendance Templates
DROP POLICY IF EXISTS "Authenticated access" ON public.attendance_templates;
CREATE POLICY "Authenticated access" ON public.attendance_templates
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Label Templates
DROP POLICY IF EXISTS "Authenticated access" ON public.label_templates;
CREATE POLICY "Authenticated access" ON public.label_templates
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Template Variables
DROP POLICY IF EXISTS "Authenticated access" ON public.template_variables;
CREATE POLICY "Authenticated access" ON public.template_variables
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Employment Status
DROP POLICY IF EXISTS "Authenticated can manage employment_status" ON public.employment_status;
CREATE POLICY "Authenticated can manage employment_status" ON public.employment_status
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Student Flags
DROP POLICY IF EXISTS "Authenticated access" ON public.student_flags;
CREATE POLICY "Authenticated access" ON public.student_flags
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- User Settings
DROP POLICY IF EXISTS "Users can manage their own settings" ON public.user_settings;
CREATE POLICY "Users can manage their own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Confirmation Tokens
DROP POLICY IF EXISTS "Authenticated can manage tokens" ON public.confirmation_tokens;
CREATE POLICY "Authenticated can manage tokens" ON public.confirmation_tokens
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anon can read tokens" ON public.confirmation_tokens;
CREATE POLICY "Anon can read tokens" ON public.confirmation_tokens
    FOR SELECT USING (true);


-- 2. Restore EXECUTE permissions on trigger functions and internal helpers
-- Trigger functions must be executable by the roles making modifications.
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_students_normalize_fn() TO PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_user_roles_updated_at_column') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.update_user_roles_updated_at_column() TO PUBLIC';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_limited_user_enrollment_updates') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.enforce_limited_user_enrollment_updates() TO PUBLIC';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.handle_new_user_role() TO PUBLIC';
    END IF;
END $$;


-- 3. Recreate public.get_user_role() as a simple helper returning 'authenticated'
-- If any policies or tools depend on this function, it will prevent breakages.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
BEGIN
    RETURN 'authenticated';
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- Grant EXECUTE to authenticated users so they can run it
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
