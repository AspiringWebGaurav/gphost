-- ==============================================================================
-- Migration: Enable Realtime for files and share_links
-- Ensures Supabase Realtime WebSocket broadcasts INSERT, UPDATE, DELETE with full row identity
-- ==============================================================================

-- 1. Full Replica Identity ensures old column values (like file_id and user_id) are delivered on UPDATE and DELETE
ALTER TABLE public.files REPLICA IDENTITY FULL;
ALTER TABLE public.share_links REPLICA IDENTITY FULL;

-- 2. Add files and share_links tables to supabase_realtime publication idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.files;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'share_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.share_links;
  END IF;
END $$;
