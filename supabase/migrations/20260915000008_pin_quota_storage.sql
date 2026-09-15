-- ==============================================================================
-- GPHosting Migration 008: PIN Storage Quota Integration & Defense Invariants
-- Project: GPHosting (https://gphost.eu.cc)
-- Source of Truth: Master Implementation Plan Revision 3.1
-- ==============================================================================

-- 1. Add quota_bytes column to onboarding_pins table if not present
ALTER TABLE public.onboarding_pins
ADD COLUMN IF NOT EXISTS quota_bytes BIGINT NULL;

COMMENT ON COLUMN public.onboarding_pins.quota_bytes IS
'Optional authoritative custom storage quota (in bytes) to assign to user profiles when this PIN is redeemed. If null, standard default quota applies.';

-- 2. Ensure profiles quota_bytes invariant is non-negative and has minimum floor
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS check_profiles_quota_bytes_min;

ALTER TABLE public.profiles
ADD CONSTRAINT check_profiles_quota_bytes_min
CHECK (quota_bytes IS NULL OR quota_bytes >= 1048576); -- Minimum 1 MB
