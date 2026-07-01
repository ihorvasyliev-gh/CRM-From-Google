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
    v_headers JSONB;
    v_auth_header TEXT;
    v_apikey TEXT;
    v_req_headers_text TEXT;
    v_host TEXT;
    v_url TEXT;
BEGIN
    -- Only trigger if the enrollment status changed to 'confirmed'
    IF (NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status <> 'confirmed')) THEN
        BEGIN
            -- Default headers
            v_headers := jsonb_build_object('Content-Type', 'application/json');
            
            -- Default URL to local Kong container
            v_url := 'http://kong:8000/functions/v1/send-push-notification';
            
            -- Retrieve request headers safely
            v_req_headers_text := current_setting('request.headers', true);
            
            IF v_req_headers_text IS NOT NULL AND v_req_headers_text <> '' THEN
                -- Extract host or x-forwarded-host (Kong proxy uses x-forwarded-host for the external domain)
                v_host := v_req_headers_text::json->>'x-forwarded-host';
                IF v_host IS NULL THEN
                    v_host := v_req_headers_text::json->>'host';
                END IF;
                
                -- Extract authorization header
                v_auth_header := v_req_headers_text::json->>'authorization';
                IF v_auth_header IS NULL THEN
                    v_auth_header := v_req_headers_text::json->>'Authorization';
                END IF;
                
                -- Extract apikey header
                v_apikey := v_req_headers_text::json->>'apikey';
                IF v_apikey IS NULL THEN
                    v_apikey := v_req_headers_text::json->>'ApiKey';
                END IF;
                
                -- Build headers dynamically
                IF v_auth_header IS NOT NULL THEN
                    v_headers := v_headers || jsonb_build_object('Authorization', v_auth_header);
                END IF;
                
                IF v_apikey IS NOT NULL THEN
                    v_headers := v_headers || jsonb_build_object('apikey', v_apikey);
                    -- If Authorization header was missing (typical for anonymous requests), use apikey as Bearer token
                    IF v_auth_header IS NULL THEN
                        v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_apikey);
                    END IF;
                END IF;
                
                -- If host matches Supabase cloud domain, rewrite URL to HTTPS external URL
                IF v_host IS NOT NULL AND v_host LIKE '%.supabase.co%' THEN
                    v_url := 'https://' || v_host || '/functions/v1/send-push-notification';
                END IF;
            END IF;
            
            -- Perform the async Net HTTP POST (wrapped in exception block to prevent blocking the UPDATE)
            PERFORM net.http_post(
                url := v_url,
                headers := v_headers,
                body := jsonb_build_object(
                    'enrollment_id', NEW.id
                )
            );
        EXCEPTION WHEN OTHERS THEN
            -- Log warning but allow the primary transaction to complete successfully
            RAISE WARNING 'Failed to trigger send-push-notification Edge Function: %', SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create the trigger on the enrollments table
CREATE TRIGGER trg_enrollment_confirmed_push
    AFTER UPDATE ON public.enrollments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_enrollment_confirmed_push();
