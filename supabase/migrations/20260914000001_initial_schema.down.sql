-- Rollback for 20260914000001_initial_schema.sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.api_keys CASCADE;
DROP TABLE IF EXISTS public.file_downloads CASCADE;
DROP TABLE IF EXISTS public.xurl_mappings CASCADE;
DROP TABLE IF EXISTS public.share_links CASCADE;
DROP TABLE IF EXISTS public.files CASCADE;
DROP TABLE IF EXISTS public.access_requests CASCADE;
DROP TABLE IF EXISTS public.onboarding_pins CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.set_updated_at();

DROP TYPE IF EXISTS download_status;
DROP TYPE IF EXISTS xurl_mapping_status;
DROP TYPE IF EXISTS expiry_preset;
DROP TYPE IF EXISTS file_status;
DROP TYPE IF EXISTS request_status;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;
