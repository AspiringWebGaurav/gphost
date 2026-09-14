-- Rollback for 20260914000002_rls_and_security.sql
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;

DROP POLICY IF EXISTS "pins_admin_all" ON public.onboarding_pins;

DROP POLICY IF EXISTS "requests_select_own" ON public.access_requests;
DROP POLICY IF EXISTS "requests_insert_own" ON public.access_requests;
DROP POLICY IF EXISTS "requests_admin_all" ON public.access_requests;

DROP POLICY IF EXISTS "files_select_own" ON public.files;
DROP POLICY IF EXISTS "files_select_admin" ON public.files;
DROP POLICY IF EXISTS "files_admin_all" ON public.files;

DROP POLICY IF EXISTS "share_links_select_own" ON public.share_links;
DROP POLICY IF EXISTS "share_links_admin_all" ON public.share_links;

DROP POLICY IF EXISTS "xurl_mappings_admin_select" ON public.xurl_mappings;
DROP POLICY IF EXISTS "xurl_mappings_admin_all" ON public.xurl_mappings;

DROP POLICY IF EXISTS "file_downloads_select_own" ON public.file_downloads;
DROP POLICY IF EXISTS "file_downloads_admin_all" ON public.file_downloads;

DROP POLICY IF EXISTS "api_keys_select_own" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_admin_all" ON public.api_keys;

DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;

DROP FUNCTION IF EXISTS public.is_admin();
