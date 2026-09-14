-- ==============================================================================
-- GPHosting: Phase 4 Download Engine & Lifecycle Procedures Migration
-- Project: GPHosting (https://gphost.eu.cc)
-- Target: Supabase Project (twrrvwzsnqildcxgbyxk)
-- Source of Truth: Master Implementation Plan Revision 3.1
-- ==============================================================================

-- 1. Atomic Download Claim Lease Acquisition
-- Row-locks share_links and files via SELECT ... FOR UPDATE
-- Enforces: file ACTIVE, share is_active, effective expiry > NOW(), download_count < max_downloads
-- Atomically creates 90-second lease in file_downloads AND inserts DOWNLOAD_CLAIMED audit log in one transaction
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

    -- Record authoritative 90-second download lease
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
        v_now + INTERVAL '90 seconds',
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
            'lease_token', p_lease_token
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
        'lease_token', p_lease_token
    );
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 2. Atomic Rollback of Download Claim
-- Called strictly if presigning fails in-memory so zero download quota is consumed
CREATE OR REPLACE FUNCTION public.rollback_download_claim(
    p_share_id UUID,
    p_lease_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Row-lock share_links
    PERFORM 1 FROM public.share_links WHERE id = p_share_id FOR UPDATE;

    UPDATE public.share_links
    SET download_count = GREATEST(0, download_count - 1),
        is_active = TRUE
    WHERE id = p_share_id;

    DELETE FROM public.file_downloads
    WHERE share_link_id = p_share_id AND lease_token = p_lease_token;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        INSERT INTO public.audit_logs (
            actor_id,
            event_type,
            resource_type,
            resource_id,
            metadata,
            ip_hash
        ) VALUES (
            NULL,
            'DOWNLOAD_CLAIM_ROLLED_BACK',
            'share_link',
            p_share_id::TEXT,
            jsonb_build_object(
                'lease_token', p_lease_token,
                'reason', 'PRESIGN_FAILED'
            ),
            'server_authoritative'
        );
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_download_claim(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_download_claim(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rollback_download_claim(UUID, TEXT) TO service_role;

-- 3. Authoritative Reconciliation for Single-Use / Burn Downloads
-- Preserves R2 object while active lease is valid (lease_expires_at > NOW())
-- Requires that the file is governed by an is_single_use = TRUE share link (independent of max_downloads)
-- Transitions to DELETE_PENDING only when lease_expires_at <= NOW()
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
    RETURN public.reclaim_file_storage(v_file.user_id, p_file_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_single_use_file(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_single_use_file(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_single_use_file(UUID) TO service_role;
