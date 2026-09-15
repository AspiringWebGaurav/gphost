-- Note: In PostgreSQL, ENUM values cannot be directly removed with ALTER TYPE DROP VALUE.
-- To revert, any files with short presets would be mapped to '24h' before recreating the type.
-- This file serves as documentation for the migration rollback path.
UPDATE public.files
SET expiry_preset = '24h'
WHERE expiry_preset::text IN ('5m', '10m', '30m', '1h', '2h', '5h', '10h', '12h');
