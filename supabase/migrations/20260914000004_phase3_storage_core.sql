-- ==============================================================================
-- GPHosting Migration 004: Phase 3 File Upload, Quota & Storage Core Procedures
-- Project: GPHosting (https://gphost.eu.cc)
-- Source of Truth: Master Implementation Plan Revision 3.1
-- ==============================================================================

-- 1. Atomic Quota Admission & Reservation
-- Enforces: used_bytes + reserved_bytes + requested_bytes <= quota_bytes
-- Unlimited for admin (quota_bytes = -1).
-- Row-locks profiles to prevent concurrent oversubscription races.
CREATE OR REPLACE FUNCTION public.reserve_user_quota(
    p_user_id UUID,
    p_requested_bytes BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quota_bytes BIGINT;
    v_storage_used_bytes BIGINT;
    v_reserved_bytes BIGINT;
    v_status user_status;
BEGIN
    SELECT quota_bytes, storage_used_bytes, reserved_bytes, status
    INTO v_quota_bytes, v_storage_used_bytes, v_reserved_bytes, v_status
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_status <> 'approved' THEN
        RETURN FALSE;
    END IF;

    -- Unlimited admin check
    IF v_quota_bytes = -1 THEN
        UPDATE public.profiles
        SET reserved_bytes = reserved_bytes + p_requested_bytes,
            updated_at = NOW()
        WHERE id = p_user_id;
        RETURN TRUE;
    END IF;

    -- Admission invariant
    IF (v_storage_used_bytes + v_reserved_bytes + p_requested_bytes <= v_quota_bytes) THEN
        UPDATE public.profiles
        SET reserved_bytes = reserved_bytes + p_requested_bytes,
            updated_at = NOW()
        WHERE id = p_user_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_user_quota(UUID, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_user_quota(UUID, BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_user_quota(UUID, BIGINT) TO service_role;

-- 2. Atomic Quota Commitment on Verified Upload
-- Converts reserved_bytes into storage_used_bytes based on verified R2 object size.
CREATE OR REPLACE FUNCTION public.commit_upload_quota(
    p_user_id UUID,
    p_reserved_bytes BIGINT,
    p_actual_bytes BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

    UPDATE public.profiles
    SET reserved_bytes = GREATEST(0, reserved_bytes - p_reserved_bytes),
        storage_used_bytes = storage_used_bytes + p_actual_bytes,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_upload_quota(UUID, BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_upload_quota(UUID, BIGINT, BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_upload_quota(UUID, BIGINT, BIGINT) TO service_role;

-- 3. Atomic Quota Reservation Release
-- Releases reserved_bytes on failed, aborted, or expired uploads.
CREATE OR REPLACE FUNCTION public.release_quota_reservation(
    p_user_id UUID,
    p_reserved_bytes BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

    UPDATE public.profiles
    SET reserved_bytes = GREATEST(0, reserved_bytes - p_reserved_bytes),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_quota_reservation(UUID, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_quota_reservation(UUID, BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_quota_reservation(UUID, BIGINT) TO service_role;

-- 4. Authoritative Deletion Quota Reclamation & Transition to DELETE_PENDING
-- Credits storage_used_bytes (or reserved_bytes if still UPLOADING), sets status = DELETE_PENDING.
-- Prevents double-crediting if already DELETE_PENDING or PURGED.
CREATE OR REPLACE FUNCTION public.reclaim_file_storage(
    p_user_id UUID,
    p_file_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_file RECORD;
BEGIN
    SELECT * INTO v_file
    FROM public.files
    WHERE id = p_file_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FILE_NOT_FOUND';
    END IF;

    -- Ownership check: user must match, or caller must be admin
    IF v_file.user_id <> p_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = p_user_id AND role = 'admin' AND status = 'approved'
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_NOT_OWNER';
        END IF;
    END IF;

    -- Prevent double-crediting
    IF v_file.status IN ('DELETE_PENDING', 'PURGED') THEN
        RETURN v_file.status::TEXT;
    END IF;

    -- Credit quota
    IF v_file.status IN ('ACTIVE', 'EXPIRING', 'EXPIRED') THEN
        UPDATE public.profiles
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - v_file.byte_size),
            updated_at = NOW()
        WHERE id = v_file.user_id;
    ELSIF v_file.status = 'UPLOADING' THEN
        UPDATE public.profiles
        SET reserved_bytes = GREATEST(0, reserved_bytes - v_file.byte_size),
            updated_at = NOW()
        WHERE id = v_file.user_id;
    END IF;

    -- Transition status
    UPDATE public.files
    SET status = 'DELETE_PENDING',
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_file_id;

    RETURN 'DELETE_PENDING';
END;
$$;

REVOKE ALL ON FUNCTION public.reclaim_file_storage(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reclaim_file_storage(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reclaim_file_storage(UUID, UUID) TO service_role;
