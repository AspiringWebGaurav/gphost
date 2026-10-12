-- ==============================================================================
-- Migration: 20261012000015_owner_api_releases_and_versioning.sql
-- Description:
--   1. Adds sha256 checksum and is_release_locked protection to public.files
--   2. Adds permissions string array to public.user_api_keys
--   3. Creates public.file_versions table for binary release version retention & rollback
-- ==============================================================================

-- 1. Extend files with cryptographic checksum and accidental-deletion release lock
ALTER TABLE public.files
    ADD COLUMN IF NOT EXISTS sha256 TEXT,
    ADD COLUMN IF NOT EXISTS is_release_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_files_sha256 ON public.files(sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_release_locked ON public.files(is_release_locked) WHERE is_release_locked = TRUE;

-- 2. Extend user_api_keys with scoped permission grants
ALTER TABLE public.user_api_keys
    ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[];

-- 3. Create file_versions table for historical binary releases & zero-downtime rollbacks
CREATE TABLE IF NOT EXISTS public.file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    r2_etag TEXT,
    byte_size BIGINT NOT NULL,
    sha256 TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT check_file_version_byte_size CHECK (byte_size > 0),
    CONSTRAINT uq_file_version_number UNIQUE (file_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON public.file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_created_at ON public.file_versions(created_at DESC);

-- Enable RLS for file_versions
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;

-- Allow users to view versions of their own files
CREATE POLICY "Users can view versions of their own files"
    ON public.file_versions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.files f
            WHERE f.id = file_versions.file_id
            AND f.user_id = auth.uid()
        )
    );

-- Allow service_role full management
CREATE POLICY "Service role can manage file versions"
    ON public.file_versions
    FOR ALL
    USING (TRUE)
    WITH CHECK (TRUE);

-- Grant table access to standard API roles
GRANT ALL ON TABLE public.file_versions TO postgres, anon, authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
