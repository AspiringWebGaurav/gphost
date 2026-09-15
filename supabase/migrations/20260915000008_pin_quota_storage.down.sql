-- Revert Migration 008
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profiles_quota_bytes_min;
ALTER TABLE public.onboarding_pins DROP COLUMN IF EXISTS quota_bytes;
