-- ==============================================================================
-- GPHosting Migration 011: Update Download Claim Lease to 50s & Single-Use Guard
-- Description:
-- 1. Updates acquire_download_claim_lease to issue 50-second download leases.
-- 2. Hardens reconcile_single_use_file to ensure single-use files that have never
--    been claimed/downloaded are never prematurely purged by background sweeps.
-- ==============================================================================

-- 1. Update acquire_download_claim_lease with 50-second lease window
CREATE OR REPLACE FUNCTION public.acquire_download_claim_lease(
    p_slug TEXT,
    p_lease_token TEXT,
    p_ip_hash TEXT,
    p_user_agent TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_share RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_effective_expiry TIMESTAMPTZ;
BEGIN
    -- Row-lock share_links and associated files row
    SELECT 
        sl.id AS share_id,
        sl.file_id,
        sl.max_downloads,
        sl.download_count,
        sl.is_single_use,
        sl.is_active,
        sl.expires_at AS share_expires_at,
        sl.password_hash,
        f.user_id,
        f.sanitized_name,
        f.byte_size,
        f.mime_type,
        f.r2_key,
        f.status AS file_status,
        f.expires_at AS file_expires_at
    INTO v_share
    FROM public.share_links sl
    JOIN public.files f ON f.id = sl.file_id
    WHERE sl.slug = p_slug
    FOR UPDATE OF sl, f;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
    END IF;

    IF NOT v_share.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'INACTIVE');
    END IF;

    IF v_share.file_status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'FILE_NOT_ACTIVE');
    END IF;

    -- Calculate effective expiry = min(file.expires_at, share.expires_at)
    IF v_share.file_expires_at IS NOT NULL AND v_share.share_expires_at IS NOT NULL THEN
        v_effective_expiry := LEAST(v_share.file_expires_at, v_share.share_expires_at);
    ELSIF v_share.file_expires_at IS NOT NULL THEN
        v_effective_expiry := v_share.file_expires_at;
    ELSE
        v_effective_expiry := v_share.share_expires_at;
    END IF;

    IF v_effective_expiry IS NOT NULL AND v_effective_expiry <= v_now THEN
        RETURN jsonb_build_object('success', false, 'error', 'EXPIRED');
    END IF;

    -- Concurrency check: max_downloads limit
    IF v_share.max_downloads IS NOT NULL AND v_share.download_count >= v_share.max_downloads THEN
        RETURN jsonb_build_object('success', false, 'error', 'DOWNLOAD_LIMIT_REACHED');
    END IF;

    -- Atomically increment download count and update active state if exhausted
    UPDATE public.share_links
    SET download_count = download_count + 1,
        is_active = CASE 
            WHEN max_downloads IS NOT NULL AND (download_count + 1) >= max_downloads THEN FALSE 
            ELSE is_active 
        END
    WHERE id = v_share.share_id;

    -- Record authoritative 50-second download lease
    INSERT INTO public.file_downloads (
        share_link_id,
        file_id,
        lease_token,
        lease_expires_at,
        ip_hash,
        user_agent,
        status
    ) VALUES (
        v_share.share_id,
        v_share.file_id,
        p_lease_token,
        v_now + INTERVAL '50 seconds',
        p_ip_hash,
        p_user_agent,
        'CLAIMED'
    );

    -- Authoritative Audit Insertion within the same atomic transaction
    INSERT INTO public.audit_logs (
        actor_id,
        event_type,
        resource_type,
        resource_id,
        metadata,
        ip_hash
    ) VALUES (
        v_share.user_id,
        'DOWNLOAD_CLAIMED',
        'share_link',
        v_share.share_id::TEXT,
        jsonb_build_object(
            'file_id', v_share.file_id,
            'sanitized_name', v_share.sanitized_name,
            'byte_size', v_share.byte_size,
            'is_single_use', v_share.is_single_use,
            'lease_token', p_lease_token,
            'lease_duration_sec', 50
        ),
        p_ip_hash
    );

    RETURN jsonb_build_object(
        'success', true,
        'share_id', v_share.share_id,
        'file_id', v_share.file_id,
        'user_id', v_share.user_id,
        'sanitized_name', v_share.sanitized_name,
        'byte_size', v_share.byte_size,
        'mime_type', v_share.mime_type,
        'r2_key', v_share.r2_key,
        'is_single_use', v_share.is_single_use,
        'download_count', v_share.download_count + 1,
        'max_downloads', v_share.max_downloads,
        'lease_token', p_lease_token,
        'expires_in_seconds', 50
    );
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 2. Harden reconcile_single_use_file to ensure only claimed downloads are reconciled
CREATE OR REPLACE FUNCTION public.reconcile_single_use_file(
    p_file_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_file RECORD;
    v_active_lease_exists BOOLEAN;
    v_has_single_use_share BOOLEAN;
    v_has_claimed_download BOOLEAN;
BEGIN
    SELECT * INTO v_file
    FROM public.files
    WHERE id = p_file_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FILE_NOT_FOUND';
    END IF;

    -- If already in deletion pipeline, prevent double-crediting
    IF v_file.status IN ('DELETE_PENDING', 'DELETE_FAILED', 'PURGED') THEN
        RETURN v_file.status::TEXT;
    END IF;

    -- Authoritative schema check: verify this file has an is_single_use = TRUE share contract
    SELECT EXISTS (
        SELECT 1 FROM public.share_links
        WHERE file_id = p_file_id AND is_single_use = TRUE
    ) INTO v_has_single_use_share;

    IF NOT v_has_single_use_share THEN
        RAISE EXCEPTION 'NOT_SINGLE_USE_FILE';
    END IF;

    -- Verify that the single-use file was actually claimed/downloaded at least once!
    -- Unclaimed/un-downloaded files must never be purged.
    SELECT EXISTS (
        SELECT 1 FROM public.file_downloads
        WHERE file_id = p_file_id
    ) OR EXISTS (
        SELECT 1 FROM public.share_links
        WHERE file_id = p_file_id AND is_single_use = TRUE AND download_count > 0
    ) INTO v_has_claimed_download;

    IF NOT v_has_claimed_download THEN
        RAISE EXCEPTION 'DOWNLOAD_NOT_CLAIMED_YET';
    END IF;

    -- Check if an authorized download lease is still active
    SELECT EXISTS (
        SELECT 1 FROM public.file_downloads
        WHERE file_id = p_file_id 
          AND status = 'CLAIMED' 
          AND lease_expires_at > NOW()
    ) INTO v_active_lease_exists;

    IF v_active_lease_exists THEN
        RAISE EXCEPTION 'DOWNLOAD_LEASE_ACTIVE';
    END IF;

    -- Mark expired leases
    UPDATE public.file_downloads
    SET status = 'EXPIRED'
    WHERE file_id = p_file_id AND status = 'CLAIMED';

    -- Call reclaim_file_storage to credit quota and set DELETE_PENDING
    PERFORM public.reclaim_file_storage(v_file.user_id, p_file_id);

    RETURN 'DELETE_PENDING';
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_single_use_file(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_single_use_file(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_single_use_file(UUID) TO service_role;

-- 3. Update periodic lifecycle sweeper to only sweep single-use files with download_count > 0
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

    -- B. Reconcile claimed single-use files whose 50s download lease has expired
    FOR v_rec IN
        SELECT DISTINCT f.id
        FROM public.files f
        JOIN public.share_links sl ON sl.file_id = f.id
        WHERE sl.is_single_use = TRUE
          AND sl.download_count > 0
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

REVOKE ALL ON FUNCTION public.supabase_periodic_lifecycle_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supabase_periodic_lifecycle_cleanup() FROM anon;
GRANT EXECUTE ON FUNCTION public.supabase_periodic_lifecycle_cleanup() TO service_role;
