-- ============================================================
-- Migration 22: User Settings Table & Security Path Fixes
-- ============================================================

-- 1. Create User Settings Table (for storing settings per user)
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on User Settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to manage their own settings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_settings' 
          AND policyname = 'Users can manage their own settings'
    ) THEN
        CREATE POLICY "Users can manage their own settings" ON public.user_settings
            FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 2. Security search_path fixes for redefined SECURITY DEFINER functions (CWE-426)
-- Enforces search_path = public to avoid hijacking after redefinitions in migrations 18, 19, 20.

-- Secure public confirmation function
ALTER FUNCTION public.public_confirm_enrollment(text, uuid) SET search_path = public;

-- Secure public employment outcome submission function (matches the 6-parameter signature)
ALTER FUNCTION public.submit_employment_status(text, boolean, text, text, text, timestamptz) SET search_path = public;

-- Secure admin outcomes pending marker function
ALTER FUNCTION public.mark_students_outcomes_pending(uuid[]) SET search_path = public;
