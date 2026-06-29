-- ============================================================
-- Migration: 33_add_push_subscriptions.sql
-- Enables Web Push notifications for confirmed enrollments.
-- ============================================================

-- Enable pg_net extension for outgoing HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Table for storing user push subscriptions
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying subscriptions by user
CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_id 
    ON public.user_push_subscriptions(user_id);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their own subscriptions
CREATE POLICY "Users can manage their own subscriptions"
    ON public.user_push_subscriptions
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. Trigger function to call the Supabase Edge Function when an enrollment is confirmed
CREATE OR REPLACE FUNCTION public.handle_enrollment_confirmed_push()
RETURNS TRIGGER AS $$
DECLARE
    project_url TEXT;
    anon_key TEXT;
BEGIN
    -- Only trigger if the enrollment status changed to 'confirmed'
    IF (NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status <> 'confirmed')) THEN
        
        -- In Supabase, we can retrieve the project URL and API key from vault or configuration if set.
        -- For a generic migration, we check if there are custom settings or fallback to localhost/Kong.
        -- We will use the internal Kong gateway which is accessible within the Supabase infrastructure:
        -- http://kong:8000/functions/v1/send-push-notification
        
        PERFORM net.http_post(
            url := 'http://kong:8000/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('request.headers', true)::json->>'authorization'
            ),
            body := jsonb_build_object(
                'enrollment_id', NEW.id
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create the trigger on the enrollments table
CREATE TRIGGER trg_enrollment_confirmed_push
    AFTER UPDATE ON public.enrollments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_enrollment_confirmed_push();
