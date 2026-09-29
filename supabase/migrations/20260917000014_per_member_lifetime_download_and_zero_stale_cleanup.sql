-- ==============================================================================
-- Migration: 20260917000014_per_member_lifetime_download_and_zero_stale_cleanup.sql
-- Description:
--   1. Adds one_per_member column to share_links (enables 1 download per member lifetime)
--   2. Adds user_id column to file_downloads for authenticated member tracking
--   3. Updates acquire_download_claim_lease to enforce per-member lifetime download
--   4. Updates periodic lifecycle sweeper to perform hard CASCADE DELETE on expired links (Zero Stale Data)
-- ==============================================================================

-- 1. Schema Enhancements
ALTER TABLE public.share_links
    ADD COLUMN IF NOT EXISTS one_per_member BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.share_links.one_per_member IS 'If true, unlimited people can access but each member/device can only download once in their lifetime';

ALTER TABLE public.file_downloads
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.file_downloads.user_id IS 'Optional authenticated user who claimed the download, enabling cross-device lifetime download tracking';

CREATE INDEX IF NOT EXISTS idx_file_downloads_link_ip 
    ON public.file_downloads(share_link_id, ip_hash);

CREATE INDEX IF NOT EXISTS idx_file_downloads_link_user 
    ON public.file_downloads(share_link_id, user_id) 
    WHERE user_id IS NOT NULL;

-- 2. Drop existing 4-arg function and recreate with optional p_user_id and lifetime check
DROP FUNCTION IF EXISTS public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.acquire_download_claim_lease(
    p_slug TEXT,
    p_lease_token TEXT,
    p_ip_hash TEXT,
    p_user_agent TEXT,
    p_user_id UUID DEFAULT NULL
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
        sl.one_per_member,
        sl.is_active,
        sl.expires_at AS share_expires_at,
        sl.password_hash,
        f.user_id AS owner_id,
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

    -- Concurrency check: max_downloads limit (if specified)
    IF v_share.max_downloads IS NOT NULL AND v_share.download_count >= v_share.max_downloads THEN
        RETURN jsonb_build_object('success', false, 'error', 'DOWNLOAD_LIMIT_REACHED');
    END IF;

    -- Per-Member Lifetime Download Check:
    -- If one_per_member is TRUE (when explicitly enabled), prevent any single person from downloading more than once
    IF COALESCE(v_share.one_per_member, FALSE) = TRUE THEN
        IF EXISTS (
            SELECT 1 FROM public.file_downloads fd
            WHERE fd.share_link_id = v_share.share_id
              AND (
                  fd.ip_hash = p_ip_hash
                  OR (p_user_id IS NOT NULL AND fd.user_id = p_user_id)
              )
              AND fd.status IN ('CLAIMED', 'COMPLETED')
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'ALREADY_DOWNLOADED_IN_LIFETIME',
                'message', 'You have already downloaded this file. Each member is limited to 1 download in their lifetime.'
            );
        END IF;
    END IF;

    -- Atomically increment download count and update active state if exhausted
    UPDATE public.share_links
    SET download_count = download_count + 1,
        is_active = CASE 
            WHEN max_downloads IS NOT NULL AND (download_count + 1) >= max_downloads THEN FALSE 
            ELSE is_active 
        END
    WHERE id = v_share.share_id;

    -- Record authoritative 50-second download lease with recipient identification
    INSERT INTO public.file_downloads (
        share_link_id,
        file_id,
        user_id,
        lease_token,
        lease_expires_at,
        ip_hash,
        user_agent,
        status
    ) VALUES (
        v_share.share_id,
        v_share.file_id,
        p_user_id,
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
        COALESCE(p_user_id, v_share.owner_id),
        'DOWNLOAD_CLAIMED',
        'share_link',
        v_share.share_id::TEXT,
        jsonb_build_object(
            'file_id', v_share.file_id,
            'sanitized_name', v_share.sanitized_name,
            'byte_size', v_share.byte_size,
            'is_single_use', v_share.is_single_use,
            'one_per_member', v_share.one_per_member,
            'lease_token', p_lease_token,
            'lease_duration_sec', 50
        ),
        p_ip_hash
    );

    RETURN jsonb_build_object(
        'success', true,
        'share_id', v_share.share_id,
        'file_id', v_share.file_id,
        'user_id', v_share.owner_id,
        'sanitized_name', v_share.sanitized_name,
        'byte_size', v_share.byte_size,
        'mime_type', v_share.mime_type,
        'r2_key', v_share.r2_key,
        'is_single_use', v_share.is_single_use,
        'one_per_member', v_share.one_per_member,
        'download_count', v_share.download_count + 1,
        'max_downloads', v_share.max_downloads,
        'lease_token', p_lease_token,
        'expires_in_seconds', 50
    );
END;
$$;

-- Allow 4-argument calls to seamlessly route to 5-arg function
CREATE OR REPLACE FUNCTION public.acquire_download_claim_lease(
    p_slug TEXT,
    p_lease_token TEXT,
    p_ip_hash TEXT,
    p_user_agent TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.acquire_download_claim_lease(p_slug, p_lease_token, p_ip_hash, p_user_agent, NULL::UUID);
$$;

REVOKE ALL ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 3. Update periodic lifecycle sweeper to perform hard CASCADE DELETE on expired share links (Zero Stale Data)
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
    -- A. Zero Stale Data: Permanently CASCADE DELETE expired share links
    -- Because foreign keys in file_downloads and xurl_mappings are ON DELETE CASCADE,
    -- all download logs and xurl mapping rows for this link are wiped cleanly.
    WITH deleted_links AS (
        DELETE FROM public.share_links
        WHERE (expires_at IS NOT NULL AND expires_at <= v_now)
           OR (max_downloads IS NOT NULL AND download_count >= max_downloads)
        RETURNING id
    )
    SELECT COUNT(*) INTO v_expired_links_count FROM deleted_links;

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
        'expired_links_purged', v_expired_links_count,
        'single_use_reconciled', v_single_use_reconciled_count,
        'stale_uploads_cleared', v_stale_uploads_cleared
    );
END;
$$;

REVOKE ALL ON FUNCTION public.supabase_periodic_lifecycle_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supabase_periodic_lifecycle_cleanup() FROM anon;
GRANT EXECUTE ON FUNCTION public.supabase_periodic_lifecycle_cleanup() TO service_role;
