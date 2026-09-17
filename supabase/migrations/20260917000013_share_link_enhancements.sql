-- ==============================================================================
-- Migration: 20260917000013_share_link_enhancements.sql
-- Description:
--   1. Adds direct_download, disable_preview, recipient_note, password_hint to share_links
--   2. Enables Vercel Hobby-safe zero-bandwidth direct transfer and security options
-- ==============================================================================

-- 1. Extend share_links with direct download, preview restriction, note, and password hint
ALTER TABLE public.share_links
    ADD COLUMN IF NOT EXISTS direct_download BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS disable_preview BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS recipient_note VARCHAR(280) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS password_hint VARCHAR(100) DEFAULT NULL;

COMMENT ON COLUMN public.share_links.direct_download IS 'If true, accessing /f/[slug] immediately redirects to file download (302)';
COMMENT ON COLUMN public.share_links.disable_preview IS 'If true, in-browser media players are disabled on landing page to force direct download';
COMMENT ON COLUMN public.share_links.recipient_note IS 'Optional note/message from creator displayed on the download landing page';
COMMENT ON COLUMN public.share_links.password_hint IS 'Optional hint shown on the password gate page';
