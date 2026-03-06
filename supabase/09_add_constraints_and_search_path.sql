-- ============================================================
-- 09_add_constraints_and_search_path.sql
-- 1. Adds CHECK constraint on enrollments.status
-- 2. Sets search_path = public for all SECURITY DEFINER functions to prevent search_path hijacking
-- ============================================================

-- 1. Add CHECK constraint to enrollments.status
DO $$
BEGIN
    -- Fix any invalid data first to avoid constraint violation
    UPDATE public.enrollments 
    SET status = 'requested' 
    WHERE status NOT IN ('requested', 'invited', 'confirmed', 'completed', 'withdrawn', 'rejected')
       OR status IS NULL;

    -- Now apply the constraint
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = 'enrollments_status_check'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_status_check 
        CHECK (status IN ('requested', 'invited', 'confirmed', 'completed', 'withdrawn', 'rejected'));
    END IF;
END $$;

-- 2. Set search_path for SECURITY DEFINER functions

-- From update_dates_rpc.sql
ALTER FUNCTION bulk_update_registration_dates(jsonb) SET search_path = public;

-- From 08_invitation_timer.sql / 04_public_confirmation_rpcs.sql
ALTER FUNCTION public_confirm_enrollment(text, uuid) SET search_path = public;

-- From 05_confirmation_tokens.sql
ALTER FUNCTION create_confirmation_token(uuid, date) SET search_path = public;
ALTER FUNCTION resolve_confirmation_token(text) SET search_path = public;

-- From 04_public_confirmation_rpcs.sql
ALTER FUNCTION get_public_course_info(uuid) SET search_path = public;
