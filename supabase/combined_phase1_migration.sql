-- ==============================================================================
-- GPHosting: Combined Phase 1 Migration (Schema + RLS + Functions + Triggers)
-- Project: GPHosting (https://gphost.eu.cc)
-- Target: Supabase Project (twrrvwzsnqildcxgbyxk)
-- Source of Truth: Master Implementation Plan Revision 3.1
-- ==============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 2. Custom Enum Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected', 'revoked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE file_status AS ENUM (
        'UPLOADING',
        'ACTIVE',
        'EXPIRING',
        'EXPIRED',
        'DELETE_PENDING',
        'DELETE_FAILED',
        'PURGED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expiry_preset AS ENUM ('24h', '7d', '30d', '90d', 'never');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE xurl_mapping_status AS ENUM ('pending', 'active', 'failed', 'cooldown');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE download_status AS ENUM ('CLAIMED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Utility Function: Timestamp updater
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 4. TABLE: profiles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email CITEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'user',
    status user_status NOT NULL DEFAULT 'pending',
    quota_bytes BIGINT NOT NULL DEFAULT 5368709120, -- 5 GB standard (-1 for unlimited admin)
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,    -- Committed physical storage
    reserved_bytes BIGINT NOT NULL DEFAULT 0,        -- Active in-flight uploads
    can_create_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_quota_valid CHECK (quota_bytes >= -1),
    CONSTRAINT check_storage_used_valid CHECK (storage_used_bytes >= 0),
    CONSTRAINT check_reserved_bytes_valid CHECK (reserved_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 5. TABLE: onboarding_pins
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    label TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    max_uses INTEGER DEFAULT NULL,
    times_used INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ DEFAULT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_times_used_valid CHECK (times_used >= 0)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_pins_active ON public.onboarding_pins(is_active) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trigger_onboarding_pins_updated_at ON public.onboarding_pins;
CREATE TRIGGER trigger_onboarding_pins_updated_at
    BEFORE UPDATE ON public.onboarding_pins
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 6. TABLE: access_requests
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status request_status NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_user ON public.access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON public.access_requests(status);

DROP TRIGGER IF EXISTS trigger_access_requests_updated_at ON public.access_requests;
CREATE TRIGGER trigger_access_requests_updated_at
    BEFORE UPDATE ON public.access_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 7. TABLE: files
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    sanitized_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    byte_size BIGINT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE,
    r2_etag TEXT,
    status file_status NOT NULL DEFAULT 'UPLOADING',
    expiry_preset expiry_preset NOT NULL DEFAULT '30d',
    expires_at TIMESTAMPTZ, -- Authoritative File Expiry (NULL for 'never')
    is_password_protected BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash TEXT,
    password_salt TEXT,
    is_multipart BOOLEAN NOT NULL DEFAULT FALSE,
    r2_upload_id TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_reconciliation_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT check_file_byte_size CHECK (byte_size > 0 AND byte_size <= 1073741824) -- Max 1 GB
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON public.files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON public.files(status);
CREATE INDEX IF NOT EXISTS idx_files_expires_at ON public.files(expires_at) WHERE status IN ('ACTIVE', 'EXPIRING');
CREATE INDEX IF NOT EXISTS idx_files_reconciliation ON public.files(status) WHERE status IN ('DELETE_PENDING', 'DELETE_FAILED');
CREATE INDEX IF NOT EXISTS idx_files_r2_key ON public.files(r2_key);

DROP TRIGGER IF EXISTS trigger_files_updated_at ON public.files;
CREATE TRIGGER trigger_files_updated_at
    BEFORE UPDATE ON public.files
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 8. TABLE: share_links
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,          -- Public URL slug (crypto-secure 12-char nanoid)
    token_hash TEXT NOT NULL,           -- Internal verification token hash
    max_downloads INTEGER DEFAULT NULL, -- NULL = unlimited, 1 = single-use burn
    download_count INTEGER NOT NULL DEFAULT 0,
    is_single_use BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,             -- Optional access window (never exceeds file.expires_at)
    password_hash TEXT,
    password_salt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT check_download_count CHECK (download_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_share_links_slug ON public.share_links(slug);
CREATE INDEX IF NOT EXISTS idx_share_links_file_id ON public.share_links(file_id);
CREATE INDEX IF NOT EXISTS idx_share_links_active ON public.share_links(is_active) WHERE is_active = TRUE;

-- ==============================================================================
-- 9. TABLE: xurl_mappings
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.xurl_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES public.share_links(id) ON DELETE CASCADE UNIQUE,
    xurl_id TEXT,                    -- Slug returned by XURL API (nullable while pending)
    xurl_short_url TEXT,             -- Full https://xurl.eu.cc/[slug]
    target_url TEXT NOT NULL,         -- https://gphost.eu.cc/f/[slug]
    status xurl_mapping_status NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xurl_mappings_status ON public.xurl_mappings(status);

DROP TRIGGER IF EXISTS trigger_xurl_mappings_updated_at ON public.xurl_mappings;
CREATE TRIGGER trigger_xurl_mappings_updated_at
    BEFORE UPDATE ON public.xurl_mappings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 10. TABLE: file_downloads
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.file_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES public.share_links(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_token TEXT NOT NULL UNIQUE,
    lease_expires_at TIMESTAMPTZ NOT NULL,
    ip_hash TEXT NOT NULL,           -- Keyed HMAC-SHA256 hash (never raw IP)
    user_agent TEXT,
    status download_status NOT NULL DEFAULT 'CLAIMED'
);

CREATE INDEX IF NOT EXISTS idx_file_downloads_share ON public.file_downloads(share_link_id);
CREATE INDEX IF NOT EXISTS idx_file_downloads_file ON public.file_downloads(file_id);
CREATE INDEX IF NOT EXISTS idx_file_downloads_lease ON public.file_downloads(lease_token);
CREATE INDEX IF NOT EXISTS idx_file_downloads_expires ON public.file_downloads(lease_expires_at);

-- ==============================================================================
-- 11. TABLE: api_keys
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,        -- First 8 chars for identification
    key_hash TEXT NOT NULL UNIQUE,   -- SHA-256 hash of API key
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);

-- ==============================================================================
-- 12. TABLE: audit_logs
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ==============================================================================
-- 13. USER BOOTSTRAP TRIGGER (auth.users -> public.profiles)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_permanent_admin BOOLEAN;
BEGIN
  is_permanent_admin := (LOWER(NEW.email) = 'gauravpatil9262@gmail.com');
  
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    role,
    status,
    quota_bytes,
    can_create_permanent
  ) VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN is_permanent_admin THEN 'admin'::user_role ELSE 'user'::user_role END,
    CASE WHEN is_permanent_admin THEN 'approved'::user_status ELSE 'pending'::user_status END,
    CASE WHEN is_permanent_admin THEN -1 ELSE 5368709120 END,
    is_permanent_admin
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 14. HARDENED ADMIN VERIFICATION FUNCTION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- ==============================================================================
-- 15. ENABLE ROW LEVEL SECURITY
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xurl_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 16. RLS POLICIES
-- ==============================================================================
-- Profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL USING (public.is_admin());

-- Onboarding PINs
DROP POLICY IF EXISTS "pins_admin_all" ON public.onboarding_pins;
CREATE POLICY "pins_admin_all" ON public.onboarding_pins
    FOR ALL USING (public.is_admin());

-- Access Requests
DROP POLICY IF EXISTS "requests_select_own" ON public.access_requests;
CREATE POLICY "requests_select_own" ON public.access_requests
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "requests_insert_own" ON public.access_requests;
CREATE POLICY "requests_insert_own" ON public.access_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "requests_admin_all" ON public.access_requests;
CREATE POLICY "requests_admin_all" ON public.access_requests
    FOR ALL USING (public.is_admin());

-- Files
DROP POLICY IF EXISTS "files_select_own" ON public.files;
CREATE POLICY "files_select_own" ON public.files
    FOR SELECT USING (
        auth.uid() = user_id AND 
        status NOT IN ('DELETE_PENDING', 'DELETE_FAILED', 'PURGED')
    );

DROP POLICY IF EXISTS "files_select_admin" ON public.files;
CREATE POLICY "files_select_admin" ON public.files
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "files_admin_all" ON public.files;
CREATE POLICY "files_admin_all" ON public.files
    FOR ALL USING (public.is_admin());

-- Share Links
DROP POLICY IF EXISTS "share_links_select_own" ON public.share_links;
CREATE POLICY "share_links_select_own" ON public.share_links
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.files f
        WHERE f.id = share_links.file_id AND f.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "share_links_admin_all" ON public.share_links;
CREATE POLICY "share_links_admin_all" ON public.share_links
    FOR ALL USING (public.is_admin());

-- XURL Mappings
DROP POLICY IF EXISTS "xurl_mappings_admin_select" ON public.xurl_mappings;
CREATE POLICY "xurl_mappings_admin_select" ON public.xurl_mappings
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "xurl_mappings_admin_all" ON public.xurl_mappings;
CREATE POLICY "xurl_mappings_admin_all" ON public.xurl_mappings
    FOR ALL USING (public.is_admin());

-- File Downloads
DROP POLICY IF EXISTS "file_downloads_select_own" ON public.file_downloads;
CREATE POLICY "file_downloads_select_own" ON public.file_downloads
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.files f
        WHERE f.id = file_downloads.file_id AND f.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "file_downloads_admin_all" ON public.file_downloads;
CREATE POLICY "file_downloads_admin_all" ON public.file_downloads
    FOR ALL USING (public.is_admin());

-- API Keys
DROP POLICY IF EXISTS "api_keys_select_own" ON public.api_keys;
CREATE POLICY "api_keys_select_own" ON public.api_keys
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_admin_all" ON public.api_keys;
CREATE POLICY "api_keys_admin_all" ON public.api_keys
    FOR ALL USING (public.is_admin());

-- Audit Logs
DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
    FOR SELECT USING (public.is_admin());

-- ==============================================================================
-- 12. ROLE GRANTS & PERMISSIONS
-- ==============================================================================
-- Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role has full administrative access (bypasses RLS)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- authenticated users can interact with tables subject to RLS policies
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Revoke all direct table, sequence, and routine access from anonymous clients
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

