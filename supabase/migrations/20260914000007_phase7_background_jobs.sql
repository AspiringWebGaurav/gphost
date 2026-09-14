-- ==============================================================================
-- GPHOSTING — PHASE 7 MIGRATION: BACKGROUND JOBS & STORAGE RECONCILIATION
-- Master Implementation Plan Revision 3.1 & Phase 7 Revision 6.1
-- ==============================================================================

-- 1. Concurrency Fencing Table: cron_cleanup_claims
CREATE TABLE IF NOT EXISTS public.cron_cleanup_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    claim_token UUID NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    expected_status TEXT NOT NULL,
    CONSTRAINT uq_cron_cleanup_claims_file UNIQUE (file_id)
);

CREATE INDEX IF NOT EXISTS idx_cron_cleanup_claims_lease 
ON public.cron_cleanup_claims (lease_expires_at);

ALTER TABLE public.cron_cleanup_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cron_cleanup_claims FROM PUBLIC;
REVOKE ALL ON public.cron_cleanup_claims FROM anon;
REVOKE ALL ON public.cron_cleanup_claims FROM authenticated;
GRANT ALL ON public.cron_cleanup_claims TO service_role;

-- 2. Stored Procedure: cron_run_lifecycle_sweep
-- Bounded lifecycle maintenance: transitions ACTIVE within 72h to EXPIRING,
-- reclaims storage for expired files via locked Phase 3 reclaim_file_storage(),
-- and deactivates expired share links.
CREATE OR REPLACE FUNCTION public.cron_run_lifecycle_sweep(
    p_batch_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_limit INT := LEAST(GREATEST(p_batch_limit, 1), 50);
    v_expiring_count INT := 0;
    v_expired_count INT := 0;
    v_deactivated_links_count INT := 0;
    v_file RECORD;
BEGIN
    -- 1. Transition ACTIVE files expiring within 72h to EXPIRING
    WITH expiring_files AS (
        SELECT id FROM public.files
        WHERE status = 'ACTIVE'
          AND expires_at IS NOT NULL
          AND expires_at <= NOW() + interval '72 hours'
          AND expires_at > NOW()
        ORDER BY expires_at ASC
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.files f
    SET status = 'EXPIRING',
        updated_at = NOW()
    FROM expiring_files ef
    WHERE f.id = ef.id;

    GET DIAGNOSTICS v_expiring_count = ROW_COUNT;

    -- 2. Expired files: call locked authoritative reclaim_file_storage
    FOR v_file IN
        SELECT id, user_id, status FROM public.files
        WHERE status IN ('ACTIVE', 'EXPIRING')
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
        ORDER BY expires_at ASC
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM public.reclaim_file_storage(v_file.user_id, v_file.id);
        v_expired_count := v_expired_count + 1;

        INSERT INTO public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
        VALUES (
            v_file.user_id,
            'FILE_EXPIRED',
            'file',
            v_file.id,
            jsonb_build_object('previous_status', v_file.status)
        );
    END LOOP;

    -- 3. Deactivate expired share links
    WITH expired_links AS (
        SELECT id FROM public.share_links
        WHERE is_active = TRUE
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.share_links sl
    SET is_active = FALSE,
        updated_at = NOW()
    FROM expired_links el
    WHERE sl.id = el.id;

    GET DIAGNOSTICS v_deactivated_links_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'expiring_count', v_expiring_count,
        'expired_count', v_expired_count,
        'deactivated_links_count', v_deactivated_links_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cron_run_lifecycle_sweep(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_run_lifecycle_sweep(INT) FROM anon;
REVOKE ALL ON FUNCTION public.cron_run_lifecycle_sweep(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_run_lifecycle_sweep(INT) TO service_role;

-- 3. Stored Procedure: cron_claim_cleanup_batch
-- Atomically claims candidates using PostgreSQL SKIP LOCKED semantics.
-- Strictly excludes single-use files with an active 90s CLAIMED download lease.
CREATE OR REPLACE FUNCTION public.cron_claim_cleanup_batch(
    p_batch_limit INT DEFAULT 50,
    p_lease_seconds INT DEFAULT 180
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_limit INT := LEAST(GREATEST(p_batch_limit, 1), 50);
    v_lease_interval INTERVAL := (LEAST(GREATEST(p_lease_seconds, 30), 600) || ' seconds')::INTERVAL;
    v_token UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := NOW();
    v_claimed_files JSONB := '[]'::JSONB;
    v_record RECORD;
BEGIN
    -- 1. First recover stale claims where lease_expires_at <= NOW()
    FOR v_record IN
        SELECT c.id AS claim_id, c.file_id, f.r2_key, f.r2_upload_id, f.status, f.byte_size, f.user_id
        FROM public.cron_cleanup_claims c
        JOIN public.files f ON c.file_id = f.id
        WHERE c.lease_expires_at <= v_now
        ORDER BY c.lease_expires_at ASC
        LIMIT v_limit
        FOR UPDATE OF c SKIP LOCKED
    LOOP
        UPDATE public.cron_cleanup_claims
        SET claim_token = v_token,
            claimed_at = v_now,
            lease_expires_at = v_now + v_lease_interval,
            expected_status = v_record.status
        WHERE id = v_record.claim_id;

        v_claimed_files := v_claimed_files || jsonb_build_object(
            'file_id', v_record.file_id,
            'claim_token', v_token,
            'r2_key', v_record.r2_key,
            'r2_upload_id', v_record.r2_upload_id,
            'status', v_record.status,
            'byte_size', v_record.byte_size,
            'user_id', v_record.user_id
        );
    END LOOP;

    -- 2. Claim fresh candidates if under v_limit
    IF jsonb_array_length(v_claimed_files) < v_limit THEN
        FOR v_record IN
            SELECT f.id AS file_id, f.r2_key, f.r2_upload_id, f.status, f.byte_size, f.user_id
            FROM public.files f
            WHERE NOT EXISTS (
                SELECT 1 FROM public.cron_cleanup_claims c WHERE c.file_id = f.id
            )
            AND (
                f.status IN ('DELETE_PENDING', 'DELETE_FAILED')
                OR (f.status = 'UPLOADING' AND f.created_at <= v_now - interval '2 hours')
                OR (
                    f.status = 'ACTIVE'
                    AND EXISTS (
                        SELECT 1 FROM public.share_links sl
                        WHERE sl.file_id = f.id AND sl.is_single_use = TRUE
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM public.file_downloads fd
                        JOIN public.share_links sl2 ON fd.share_link_id = sl2.id
                        WHERE sl2.file_id = f.id
                          AND sl2.is_single_use = TRUE
                          AND fd.status = 'CLAIMED'
                          AND fd.lease_expires_at > v_now
                    )
                )
            )
            ORDER BY f.created_at ASC
            LIMIT (v_limit - jsonb_array_length(v_claimed_files))
            FOR UPDATE OF f SKIP LOCKED
        LOOP
            INSERT INTO public.cron_cleanup_claims (
                file_id,
                claim_token,
                claimed_at,
                lease_expires_at,
                expected_status
            )
            VALUES (
                v_record.file_id,
                v_token,
                v_now,
                v_now + v_lease_interval,
                v_record.status
            )
            ON CONFLICT (file_id) DO NOTHING;

            IF FOUND THEN
                v_claimed_files := v_claimed_files || jsonb_build_object(
                    'file_id', v_record.file_id,
                    'claim_token', v_token,
                    'r2_key', v_record.r2_key,
                    'r2_upload_id', v_record.r2_upload_id,
                    'status', v_record.status,
                    'byte_size', v_record.byte_size,
                    'user_id', v_record.user_id
                );
            END IF;
        END LOOP;
    END IF;

    RETURN v_claimed_files;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_claim_cleanup_batch(INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_claim_cleanup_batch(INT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.cron_claim_cleanup_batch(INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_claim_cleanup_batch(INT, INT) TO service_role;

-- 4. Stored Procedure: cron_fence_abandoned_upload
-- Single-transaction atomic DB fence for abandoned UPLOADING candidates.
-- Invariant: DB fence committed first -> complete-upload can no longer transition
-- file from UPLOADING to ACTIVE -> destructive R2 operation is safe.
CREATE OR REPLACE FUNCTION public.cron_fence_abandoned_upload(
    p_claim_token UUID,
    p_file_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claim RECORD;
    v_file RECORD;
    v_reclaim_status TEXT;
BEGIN
    -- 1. Validate claim token fence
    SELECT * INTO v_claim
    FROM public.cron_cleanup_claims
    WHERE file_id = p_file_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CLAIM_NOT_FOUND');
    END IF;

    IF v_claim.claim_token <> p_claim_token THEN
        RAISE EXCEPTION 'CLAIM_TOKEN_MISMATCH';
    END IF;

    -- 2. Lock files row FOR UPDATE
    SELECT * INTO v_file
    FROM public.files
    WHERE id = p_file_id
    FOR UPDATE;

    IF NOT FOUND THEN
        DELETE FROM public.cron_cleanup_claims WHERE file_id = p_file_id;
        RETURN jsonb_build_object('success', false, 'reason', 'FILE_NOT_FOUND');
    END IF;

    -- 3. Ordering A: Upload completion obtained DB lock first
    IF v_file.status <> 'UPLOADING' THEN
        -- Upload completed and transitioned to ACTIVE!
        -- MUST NOT perform destructive R2 operations.
        DELETE FROM public.cron_cleanup_claims WHERE file_id = p_file_id;
        RETURN jsonb_build_object(
            'success', false,
            'status', v_file.status,
            'reason', 'UPLOAD_COMPLETED_RACE_WON'
        );
    END IF;

    -- 4. Ordering B: Cleanup obtains authoritative DB fence first
    -- Executed in the same single transaction: calls locked Phase 3 procedure
    -- Releases reserved_bytes on profiles and sets files.status = 'DELETE_PENDING'
    v_reclaim_status := public.reclaim_file_storage(v_file.user_id, p_file_id);

    -- Update claim expected_status to match new DB state
    UPDATE public.cron_cleanup_claims
    SET expected_status = 'DELETE_PENDING'
    WHERE file_id = p_file_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'DELETE_PENDING',
        'r2_key', v_file.r2_key,
        'r2_upload_id', v_file.r2_upload_id,
        'byte_size', v_file.byte_size,
        'user_id', v_file.user_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cron_fence_abandoned_upload(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_fence_abandoned_upload(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.cron_fence_abandoned_upload(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_fence_abandoned_upload(UUID, UUID) TO service_role;

-- 5. Stored Procedure: cron_finalize_cleanup
-- Finalizes state for candidates in DELETE_PENDING or DELETE_FAILED.
-- Note: Quota was already reclaimed when transitioned to DELETE_PENDING.
CREATE OR REPLACE FUNCTION public.cron_finalize_cleanup(
    p_claim_token UUID,
    p_file_id UUID,
    p_target_status TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claim RECORD;
    v_file RECORD;
BEGIN
    -- 1. Validate claim token fence
    SELECT * INTO v_claim
    FROM public.cron_cleanup_claims
    WHERE file_id = p_file_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CLAIM_NOT_FOUND');
    END IF;

    IF v_claim.claim_token <> p_claim_token THEN
        RAISE EXCEPTION 'CLAIM_TOKEN_MISMATCH';
    END IF;

    -- 2. Lock files row FOR UPDATE
    SELECT * INTO v_file
    FROM public.files
    WHERE id = p_file_id
    FOR UPDATE;

    IF NOT FOUND THEN
        DELETE FROM public.cron_cleanup_claims WHERE file_id = p_file_id;
        RETURN jsonb_build_object('success', false, 'reason', 'FILE_NOT_FOUND');
    END IF;

    -- State check: only DELETE_PENDING or DELETE_FAILED files can be finalized to PURGED/DELETE_FAILED
    IF v_file.status NOT IN ('DELETE_PENDING', 'DELETE_FAILED') THEN
        DELETE FROM public.cron_cleanup_claims WHERE file_id = p_file_id;
        RETURN jsonb_build_object(
            'success', false,
            'status', v_file.status,
            'reason', 'INVALID_STATUS_FOR_FINALIZATION'
        );
    END IF;

    IF p_target_status = 'PURGED' THEN
        UPDATE public.files
        SET status = 'PURGED',
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = p_file_id;

        UPDATE public.share_links
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE file_id = p_file_id AND is_active = TRUE;

        INSERT INTO public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
        VALUES (
            v_file.user_id,
            'FILE_PURGED',
            'file',
            p_file_id,
            jsonb_build_object('byte_size', v_file.byte_size, 'claim_token', p_claim_token)
        );
    ELSIF p_target_status = 'DELETE_FAILED' THEN
        UPDATE public.files
        SET status = 'DELETE_FAILED',
            last_reconciliation_error = p_error_message,
            updated_at = NOW()
        WHERE id = p_file_id;
    END IF;

    DELETE FROM public.cron_cleanup_claims WHERE file_id = p_file_id;

    RETURN jsonb_build_object('success', true, 'file_id', p_file_id, 'status', p_target_status);
END;
$$;

REVOKE ALL ON FUNCTION public.cron_finalize_cleanup(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_finalize_cleanup(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.cron_finalize_cleanup(UUID, UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_finalize_cleanup(UUID, UUID, TEXT, TEXT) TO service_role;

-- 6. Stored Procedure: cron_release_claim
-- Safely releases claim row when candidate becomes ineligible.
CREATE OR REPLACE FUNCTION public.cron_release_claim(
    p_claim_token UUID,
    p_file_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.cron_cleanup_claims 
    WHERE file_id = p_file_id AND claim_token = p_claim_token;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_release_claim(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_release_claim(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.cron_release_claim(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_release_claim(UUID, UUID) TO service_role;

-- 7. Supabase pg_cron + pg_net Scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gphost-lifecycle') THEN
        PERFORM cron.unschedule('gphost-lifecycle');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gphost-cleanup') THEN
        PERFORM cron.unschedule('gphost-cleanup');
    END IF;
END $$;

SELECT cron.schedule(
    'gphost-lifecycle',
    '0,10,20,30,40,50 * * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'EDGE_FUNCTION_LIFECYCLE_URL' LIMIT 1),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
        ),
        body := jsonb_build_object('batch_limit', 50)
    );
    $$
);

SELECT cron.schedule(
    'gphost-cleanup',
    '5,15,25,35,45,55 * * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'EDGE_FUNCTION_CLEANUP_URL' LIMIT 1),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
        ),
        body := jsonb_build_object('batch_limit', 50, 'lease_seconds', 180)
    );
    $$
);
