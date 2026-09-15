-- ==============================================================================
-- GPHosting Migration 009: Expand expiry_preset ENUM with Granular Durations
-- Project: GPHosting (https://gphost.eu.cc)
-- Supports: 5m, 10m, 30m, 1h, 2h, 5h, 10h, 12h, 24h, 7d, 30d, 90d, never
-- ==============================================================================

-- Safely add each new enum value to expiry_preset type if not already present
ALTER TYPE public.expiry_preset ADD VALUE IF NOT EXISTS '5m';
ALTER TYPE public.expiry_preset ADD VALUE IF NOT EXISTS '10m';
ALTER TYPE public.expiry_preset ADD VALUE IF NOT EXISTS '30m';
ALTER TYPE public.expiry_preset ADD VALUE IF NOT EXISTS '1h';
ALTER TYPE public.expiry_preset ADD VALUE IF NOT EXISTS '2h';
ALTER TYPE public.expiry_preset ADD VALUE IF NOT EXISTS '5h';
ALTER TYPE public.expiry_preset ADD VALUE IF NOT EXISTS '10h';
ALTER TYPE public.expiry_preset ADD VALUE IF NOT EXISTS '12h';

COMMENT ON TYPE public.expiry_preset IS
'Authoritative expiration presets for files and shared links: 5m, 10m, 30m, 1h, 2h, 5h, 10h, 12h, 24h, 7d, 30d, 90d, never.';
