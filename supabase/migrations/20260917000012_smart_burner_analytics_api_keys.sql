-- ==============================================================================
-- Migration: 20260917000012_smart_burner_analytics_api_keys.sql
-- Description:
--   1. Adds burn_after_preview, first_previewed_at, preview_count to share_links
--   2. Creates file_events table for edge telemetry (country, city, referrer)
--   3. Creates user_api_keys table for headless CLI and terminal uploads
-- ==============================================================================

-- 1. Extend share_links with Burn-on-Preview lifecycle fields
ALTER TABLE public.share_links
    ADD COLUMN IF NOT EXISTS burn_after_preview BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS first_previewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS preview_count INTEGER NOT NULL DEFAULT 0;

-- 2. Create file_events table for lightweight Cloudflare edge telemetry
CREATE TABLE IF NOT EXISTS public.file_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    share_link_id UUID REFERENCES public.share_links(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'download', 'preview', 'raw_view'
    country_code TEXT,        -- e.g. 'US', 'IN', 'DE'
    city TEXT,
    referrer TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_events_file_id ON public.file_events(file_id);
CREATE INDEX IF NOT EXISTS idx_file_events_created_at ON public.file_events(created_at);
CREATE INDEX IF NOT EXISTS idx_file_events_type ON public.file_events(event_type);

-- Enable RLS for file_events
ALTER TABLE public.file_events ENABLE ROW LEVEL SECURITY;

-- Allow users to view events for their own files
CREATE POLICY "Users can view events for their own files"
    ON public.file_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.files f
            WHERE f.id = file_events.file_id
            AND f.user_id = auth.uid()
        )
    );

-- Allow service_role to insert events
CREATE POLICY "Service role can insert file events"
    ON public.file_events
    FOR INSERT
    WITH CHECK (TRUE);

-- 3. Create user_api_keys table for headless terminal/curl uploads
CREATE TABLE IF NOT EXISTS public.user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,       -- e.g. 'gp_live_a1b2' (for UI display)
    key_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash of the complete API key
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_hash ON public.user_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user ON public.user_api_keys(user_id);

-- Enable RLS for user_api_keys
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API keys"
    ON public.user_api_keys
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own API keys"
    ON public.user_api_keys
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own API keys"
    ON public.user_api_keys
    FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own API keys"
    ON public.user_api_keys
    FOR DELETE
    USING (user_id = auth.uid());

-- Grant table access to API roles (PostgREST roles)
GRANT ALL ON TABLE public.file_events TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_api_keys TO postgres, anon, authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
