-- ==============================================================================
-- GPHosting Migration 002: RLS Policies & Security Hardening
-- Project: GPHosting (https://gphost.eu.cc)
-- Source of Truth: Master Implementation Plan Revision 3.1
-- ==============================================================================

-- 1. Hardened Admin Verification Function
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

-- Restrict function execution
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- 2. Enable Row Level Security Across All Application Tables
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
-- 3. PROFILES POLICIES
-- ==============================================================================
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
    FOR SELECT USING (public.is_admin());

-- Only Admins have direct mutation privileges. Normal client direct UPDATE/INSERT/DELETE is revoked.
-- Profile updates to vanity fields (full_name, avatar_url) must be mediated by server Route Handlers.
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL USING (public.is_admin());

-- ==============================================================================
-- 4. ONBOARDING PINS POLICIES (Admin Only)
-- ==============================================================================
DROP POLICY IF EXISTS "pins_admin_all" ON public.onboarding_pins;
CREATE POLICY "pins_admin_all" ON public.onboarding_pins
    FOR ALL USING (public.is_admin());

-- ==============================================================================
-- 5. ACCESS REQUESTS POLICIES
-- ==============================================================================
DROP POLICY IF EXISTS "requests_select_own" ON public.access_requests;
CREATE POLICY "requests_select_own" ON public.access_requests
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "requests_insert_own" ON public.access_requests;
CREATE POLICY "requests_insert_own" ON public.access_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "requests_admin_all" ON public.access_requests;
CREATE POLICY "requests_admin_all" ON public.access_requests
    FOR ALL USING (public.is_admin());

-- ==============================================================================
-- 6. FILES POLICIES
-- ==============================================================================
-- Normal users view only their own active, uploading, or expiring files.
-- Files in DELETE_PENDING, DELETE_FAILED, or PURGED are strictly excluded.
DROP POLICY IF EXISTS "files_select_own" ON public.files;
CREATE POLICY "files_select_own" ON public.files
    FOR SELECT USING (
        auth.uid() = user_id AND 
        status NOT IN ('DELETE_PENDING', 'DELETE_FAILED', 'PURGED')
    );

DROP POLICY IF EXISTS "files_select_admin" ON public.files;
CREATE POLICY "files_select_admin" ON public.files
    FOR SELECT USING (public.is_admin());

-- Client direct INSERT, UPDATE, DELETE is revoked. Operations go through server Route Handlers.
DROP POLICY IF EXISTS "files_admin_all" ON public.files;
CREATE POLICY "files_admin_all" ON public.files
    FOR ALL USING (public.is_admin());

-- ==============================================================================
-- 7. SHARE LINKS POLICIES
-- ==============================================================================
-- Users can view share links for files they own
DROP POLICY IF EXISTS "share_links_select_own" ON public.share_links;
CREATE POLICY "share_links_select_own" ON public.share_links
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.files f
        WHERE f.id = share_links.file_id AND f.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "share_links_admin_all" ON public.share_links;
CREATE POLICY "share_links_admin_all" ON public.share_links
    FOR ALL USING (public.is_admin());

-- ==============================================================================
-- 8. XURL MAPPINGS POLICIES (Admin / Service Role Only)
-- ==============================================================================
DROP POLICY IF EXISTS "xurl_mappings_admin_select" ON public.xurl_mappings;
CREATE POLICY "xurl_mappings_admin_select" ON public.xurl_mappings
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "xurl_mappings_admin_all" ON public.xurl_mappings;
CREATE POLICY "xurl_mappings_admin_all" ON public.xurl_mappings
    FOR ALL USING (public.is_admin());

-- ==============================================================================
-- 9. FILE DOWNLOADS POLICIES
-- ==============================================================================
-- File owners can select download records for their files (read-only download analytics)
DROP POLICY IF EXISTS "file_downloads_select_own" ON public.file_downloads;
CREATE POLICY "file_downloads_select_own" ON public.file_downloads
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.files f
        WHERE f.id = file_downloads.file_id AND f.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "file_downloads_admin_all" ON public.file_downloads;
CREATE POLICY "file_downloads_admin_all" ON public.file_downloads
    FOR ALL USING (public.is_admin());

-- ==============================================================================
-- 10. API KEYS POLICIES
-- ==============================================================================
-- Users can view their own API key prefixes and metadata
DROP POLICY IF EXISTS "api_keys_select_own" ON public.api_keys;
CREATE POLICY "api_keys_select_own" ON public.api_keys
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_admin_all" ON public.api_keys;
CREATE POLICY "api_keys_admin_all" ON public.api_keys
    FOR ALL USING (public.is_admin());

-- ==============================================================================
-- 11. AUDIT LOGS POLICIES (Append-only via service_role, Admin viewable)
-- ==============================================================================
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

