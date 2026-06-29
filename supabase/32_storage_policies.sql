-- ============================================================
-- Migration 32: Configure Storage Policies for Templates Bucket
-- ============================================================
-- NOTE: storage.objects is owned by supabase_storage_admin,
-- so we must assume that role to CREATE/DROP policies on it.

-- Switch to the storage owner role
SET ROLE supabase_storage_admin;

-- 1. Ensure the 'templates' bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if they exist to prevent migration conflicts
DROP POLICY IF EXISTS "Allow authenticated users to upload templates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update templates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete templates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view templates" ON storage.objects;

-- 4. Create policies

-- INSERT policy: Allow authenticated users to upload files to 'templates' bucket (admins, employees, etc., but not viewers)
CREATE POLICY "Allow authenticated users to upload templates" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'templates'
        AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- UPDATE policy: Allow authenticated users to replace files in 'templates' bucket (not viewers)
CREATE POLICY "Allow authenticated users to update templates" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'templates'
        AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    )
    WITH CHECK (
        bucket_id = 'templates'
        AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- DELETE policy: Allow authenticated users to delete files in 'templates' bucket (not viewers)
CREATE POLICY "Allow authenticated users to delete templates" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'templates'
        AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'viewer'
    );

-- SELECT policy: Allow authenticated users to view/fetch files in 'templates' bucket
CREATE POLICY "Allow authenticated users to view templates" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'templates'
    );

-- Reset back to the default role
RESET ROLE;
