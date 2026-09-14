-- Rollback for 20260914000003_phase2_auth_hardening.sql
DROP FUNCTION IF EXISTS public.redeem_onboarding_pin(UUID, UUID);
DROP INDEX IF EXISTS public.idx_access_requests_unique_pending;
