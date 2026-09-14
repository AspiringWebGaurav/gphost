-- ==============================================================================
-- GPHosting Migration 006 Rollback: Drop Phase 6 Admin Operations Stored Procedures
-- Project: GPHosting (https://gphost.eu.cc)
-- Source of Truth: Master Implementation Plan Revision 3.1 & Phase 6 Revision 4
-- ==============================================================================

DROP FUNCTION IF EXISTS public.admin_force_delete_file(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_revoke_onboarding_pin(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_create_onboarding_pin(UUID, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_user_profile(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_user_quota(UUID, UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.admin_review_access_request(UUID, UUID, TEXT, TEXT, TEXT);
