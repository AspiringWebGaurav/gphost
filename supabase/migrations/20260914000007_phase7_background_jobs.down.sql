-- ==============================================================================
-- GPHOSTING — PHASE 7 ROLLBACK MIGRATION
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gphost-lifecycle') THEN
        PERFORM cron.unschedule('gphost-lifecycle');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gphost-cleanup') THEN
        PERFORM cron.unschedule('gphost-cleanup');
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

DROP FUNCTION IF EXISTS public.cron_release_claim(UUID, UUID);
DROP FUNCTION IF EXISTS public.cron_finalize_cleanup(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cron_fence_abandoned_upload(UUID, UUID);
DROP FUNCTION IF EXISTS public.cron_claim_cleanup_batch(INT, INT);
DROP FUNCTION IF EXISTS public.cron_run_lifecycle_sweep(INT);

DROP TABLE IF EXISTS public.cron_cleanup_claims;
