-- ==============================================================================
-- Migration: 20260916000010_supabase_native_cron_cleanup.sql
-- Description: Native Supabase pg_cron Database Maintenance & Lifecycle Sweeper
-- Operates 100% inside PostgreSQL engine without requiring Vercel Crons
-- ==============================================================================

-- 1. Enable pg_cron extension if not already enabled (Supported natively on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Authoritative Database Maintenance & Lifecycle Cleanup Function
CREATE OR REPLACE FUNCTION public.supabase_periodic_lifecycle_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_expired_links_count INT := 0;
    v_single_use_reconciled_count INT := 0;
    v_stale_uploads_cleared INT := 0;
    v_rec RECORD;
BEGIN
    -- A. Deactivate expired share links
    WITH deactivated AS (
        UPDATE public.share_links
        SET is_active = FALSE,
            updated_at = v_now
        WHERE is_active = TRUE
          AND expires_at IS NOT NULL
          AND expires_at <= v_now
        RETURNING id
    )
    SELECT COUNT(*) INTO v_expired_links_count FROM deactivated;

    -- B. Reconcile claimed single-use files whose 90s download lease has expired
    -- Uses existing authoritative reconcile_single_use_file function
    FOR v_rec IN
        SELECT DISTINCT f.id
        FROM public.files f
        JOIN public.share_links sl ON sl.file_id = f.id
        WHERE sl.is_single_use = TRUE
          AND f.status NOT IN ('PURGED', 'DELETE_PENDING')
          AND NOT EXISTS (
              SELECT 1
              FROM public.file_downloads fd
              WHERE fd.file_id = f.id
                AND fd.lease_expires_at > v_now
          )
        LIMIT 50
    LOOP
        BEGIN
            PERFORM public.reconcile_single_use_file(v_rec.id);
            v_single_use_reconciled_count := v_single_use_reconciled_count + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Ignore transient errors for individual files so sweep continues
            NULL;
        END;
    END LOOP;

    -- C. Clear stale incomplete upload leases (> 24 hours old)
    WITH deleted_uploads AS (
        DELETE FROM public.file_uploads
        WHERE status = 'INITIATED'
          AND expires_at <= v_now - INTERVAL '24 hours'
        RETURNING id
    )
    SELECT COUNT(*) INTO v_stale_uploads_cleared FROM deleted_uploads;

    RETURN jsonb_build_object(
        'success', TRUE,
        'executed_at', v_now,
        'expired_links_deactivated', v_expired_links_count,
        'single_use_reconciled', v_single_use_reconciled_count,
        'stale_uploads_cleared', v_stale_uploads_cleared
    );
END;
$$;

-- Secure function permissions
REVOKE ALL ON FUNCTION public.supabase_periodic_lifecycle_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supabase_periodic_lifecycle_cleanup() FROM anon;
GRANT EXECUTE ON FUNCTION public.supabase_periodic_lifecycle_cleanup() TO service_role;

-- 3. Schedule the recurring cron job natively in Supabase pg_cron (Hourly)
-- Runs at the start of every hour (0 * * * *)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove existing schedule if previously registered
        PERFORM cron.unschedule('gphost_hourly_lifecycle_cleanup')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gphost_hourly_lifecycle_cleanup');

        -- Schedule new job
        PERFORM cron.schedule(
            'gphost_hourly_lifecycle_cleanup',
            '0 * * * *',
            'SELECT public.supabase_periodic_lifecycle_cleanup();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- If user environment lacks cron schema permissions during local tests, fail gracefully
    RAISE NOTICE 'pg_cron schedule notice: %', SQLERRM;
END;
$$;
