-- ==============================================================================
-- GPHosting Migration 006: Admin Control Center Operations & Security Stored Procedures
-- Project: GPHosting (https://gphost.eu.cc)
-- Source of Truth: Master Implementation Plan Revision 3.1 & Phase 6 Revision 4
-- ==============================================================================

-- 1. ATOMIC ACCESS REQUEST REVIEW
CREATE OR REPLACE FUNCTION public.admin_review_access_request(
    p_admin_id UUID,
    p_request_id UUID,
    p_action TEXT,              -- 'approve' or 'reject'
    p_rejection_reason TEXT,
    p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin RECORD;
    v_request RECORD;
BEGIN
    -- 1. Verify caller is an approved admin
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND OR v_admin.role <> 'admin' OR v_admin.status <> 'approved' THEN
        RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
    END IF;

    -- 2. Lock target access request row
    SELECT * INTO v_request 
    FROM public.access_requests 
    WHERE id = p_request_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'REQUEST_NOT_FOUND';
    END IF;

    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'REQUEST_NOT_PENDING';
    END IF;

    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'INVALID_ACTION: Must be approve or reject';
    END IF;

    -- 3. Update access request status
    UPDATE public.access_requests
    SET status = p_action::request_status,
        reviewed_by = p_admin_id,
        reviewed_at = NOW(),
        rejection_reason = p_rejection_reason,
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 4. Update target user profile status
    UPDATE public.profiles
    SET status = p_action::user_status,
        updated_at = NOW()
    WHERE id = v_request.user_id;

    -- 5. Insert audit log atomically
    INSERT INTO public.audit_logs (actor_id, event_type, resource_type, resource_id, metadata, ip_hash)
    VALUES (
        p_admin_id,
        'ADMIN_ACCESS_REQUEST_REVIEW',
        'access_request',
        p_request_id::TEXT,
        jsonb_build_object(
            'target_user_id', v_request.user_id,
            'action', p_action,
            'rejection_reason', p_rejection_reason
        ),
        p_ip_hash
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'target_user_id', v_request.user_id,
        'status', p_action
    );
END;
$$;

-- 2. ATOMIC CONCURRENCY-SAFE ADMIN QUOTA UPDATE
CREATE OR REPLACE FUNCTION public.admin_update_user_quota(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_new_quota_bytes BIGINT,
    p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin RECORD;
    v_profile RECORD;
BEGIN
    -- 1. Verify caller is an approved admin
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND OR v_admin.role <> 'admin' OR v_admin.status <> 'approved' THEN
        RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
    END IF;

    -- 2. Lock target user profile
    SELECT * INTO v_profile 
    FROM public.profiles 
    WHERE id = p_target_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;

    -- 3. Invariant check: committed storage + reserved bytes <= new quota (unless -1 unlimited)
    IF p_new_quota_bytes <> -1 AND (v_profile.storage_used_bytes + v_profile.reserved_bytes > p_new_quota_bytes) THEN
        RAISE EXCEPTION 'QUOTA_VIOLATES_COMMITTED_STORAGE: committed (% bytes) exceeds requested quota (% bytes)',
            (v_profile.storage_used_bytes + v_profile.reserved_bytes), p_new_quota_bytes;
    END IF;

    -- 4. Update quota
    UPDATE public.profiles
    SET quota_bytes = p_new_quota_bytes,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- 5. Insert audit log atomically
    INSERT INTO public.audit_logs (actor_id, event_type, resource_type, resource_id, metadata, ip_hash)
    VALUES (
        p_admin_id,
        'ADMIN_USER_QUOTA_UPDATE',
        'profile',
        p_target_user_id::TEXT,
        jsonb_build_object(
            'old_quota_bytes', v_profile.quota_bytes,
            'new_quota_bytes', p_new_quota_bytes,
            'storage_used_bytes', v_profile.storage_used_bytes,
            'reserved_bytes', v_profile.reserved_bytes
        ),
        p_ip_hash
    );

    RETURN jsonb_build_object(
        'success', true,
        'target_user_id', p_target_user_id,
        'old_quota_bytes', v_profile.quota_bytes,
        'new_quota_bytes', p_new_quota_bytes
    );
END;
$$;

-- 3. ATOMIC ADMIN USER PROFILE MUTATION (Zero Trust in Caller Boolean)
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_new_role TEXT,                     -- nullable ('user' or 'admin')
    p_new_status TEXT,                   -- nullable ('pending', 'approved', 'rejected', 'revoked')
    p_can_create_permanent BOOLEAN,      -- nullable
    p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin RECORD;
    v_target RECORD;
    v_owner_email TEXT := 'gauravpatil9262@gmail.com';
    v_caller_is_owner BOOLEAN := FALSE;
BEGIN
    -- 1. Validate caller is an admin
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND OR v_admin.role <> 'admin' OR v_admin.status <> 'approved' THEN
        RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
    END IF;

    -- 2. Independently derive owner authority from caller profile email (NEVER trusted from caller args)
    IF lower(v_admin.email) = lower(v_owner_email) THEN
        v_caller_is_owner := TRUE;
    END IF;

    -- 3. Lock target profile
    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;

    -- 4. Permanent owner immutability: Cannot modify permanent owner's role or status
    IF lower(v_target.email) = lower(v_owner_email) THEN
        IF (p_new_role IS NOT NULL AND p_new_role <> 'admin') OR (p_new_status IS NOT NULL AND p_new_status <> 'approved') THEN
            RAISE EXCEPTION 'PERMANENT_OWNER_IMMUTABLE: Permanent owner role and status cannot be modified';
        END IF;
    END IF;

    -- 5. Role elevation/demotion authorization (Owner-exclusive)
    IF p_new_role IS NOT NULL AND p_new_role <> v_target.role::TEXT THEN
        IF NOT v_caller_is_owner THEN
            RAISE EXCEPTION 'FORBIDDEN_OWNER_REQUIRED: Owner authority required to modify admin roles';
        END IF;
    END IF;

    -- 6. Self-lockout prevention
    IF p_admin_id = p_target_user_id THEN
        IF p_new_status IS NOT NULL AND p_new_status <> 'approved' THEN
            RAISE EXCEPTION 'SELF_LOCKOUT_PREVENTED: Cannot revoke or reject your own administrative account';
        END IF;
        IF p_new_role IS NOT NULL AND p_new_role <> 'admin' THEN
            RAISE EXCEPTION 'SELF_DEMOTION_PREVENTED: Cannot demote your own administrative role';
        END IF;
    END IF;

    -- 7. Apply updates
    UPDATE public.profiles
    SET role = COALESCE(p_new_role::user_role, role),
        status = COALESCE(p_new_status::user_status, status),
        can_create_permanent = COALESCE(p_can_create_permanent, can_create_permanent),
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- 8. Insert audit log atomically
    INSERT INTO public.audit_logs (actor_id, event_type, resource_type, resource_id, metadata, ip_hash)
    VALUES (
        p_admin_id,
        'ADMIN_USER_PROFILE_UPDATE',
        'profile',
        p_target_user_id::TEXT,
        jsonb_build_object(
            'old_role', v_target.role,
            'new_role', COALESCE(p_new_role, v_target.role::TEXT),
            'old_status', v_target.status,
            'new_status', COALESCE(p_new_status, v_target.status::TEXT),
            'old_can_create_permanent', v_target.can_create_permanent,
            'new_can_create_permanent', COALESCE(p_can_create_permanent, v_target.can_create_permanent)
        ),
        p_ip_hash
    );

    RETURN jsonb_build_object(
        'success', true,
        'target_user_id', p_target_user_id,
        'role', COALESCE(p_new_role, v_target.role::TEXT),
        'status', COALESCE(p_new_status, v_target.status::TEXT),
        'can_create_permanent', COALESCE(p_can_create_permanent, v_target.can_create_permanent)
    );
END;
$$;

-- 4. ATOMIC ONBOARDING PIN CREATION
CREATE OR REPLACE FUNCTION public.admin_create_onboarding_pin(
    p_admin_id UUID,
    p_pin_hash TEXT,
    p_pin_salt TEXT,
    p_label TEXT,
    p_max_uses INTEGER,
    p_expires_at TIMESTAMPTZ,
    p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin RECORD;
    v_new_pin_id UUID;
BEGIN
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND OR v_admin.role <> 'admin' OR v_admin.status <> 'approved' THEN
        RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
    END IF;

    INSERT INTO public.onboarding_pins (pin_hash, pin_salt, label, is_active, max_uses, times_used, expires_at, created_by)
    VALUES (p_pin_hash, p_pin_salt, p_label, TRUE, p_max_uses, 0, p_expires_at, p_admin_id)
    RETURNING id INTO v_new_pin_id;

    INSERT INTO public.audit_logs (actor_id, event_type, resource_type, resource_id, metadata, ip_hash)
    VALUES (
        p_admin_id,
        'ADMIN_PIN_CREATE',
        'onboarding_pin',
        v_new_pin_id::TEXT,
        jsonb_build_object('label', p_label, 'max_uses', p_max_uses, 'expires_at', p_expires_at),
        p_ip_hash
    );

    RETURN jsonb_build_object('success', true, 'pin_id', v_new_pin_id);
END;
$$;

-- 5. ATOMIC ONBOARDING PIN REVOCATION
CREATE OR REPLACE FUNCTION public.admin_revoke_onboarding_pin(
    p_admin_id UUID,
    p_pin_id UUID,
    p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin RECORD;
    v_pin RECORD;
BEGIN
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND OR v_admin.role <> 'admin' OR v_admin.status <> 'approved' THEN
        RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
    END IF;

    SELECT * INTO v_pin FROM public.onboarding_pins WHERE id = p_pin_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PIN_NOT_FOUND';
    END IF;

    UPDATE public.onboarding_pins
    SET is_active = FALSE, updated_at = NOW()
    WHERE id = p_pin_id;

    INSERT INTO public.audit_logs (actor_id, event_type, resource_type, resource_id, metadata, ip_hash)
    VALUES (
        p_admin_id,
        'ADMIN_PIN_REVOKE',
        'onboarding_pin',
        p_pin_id::TEXT,
        jsonb_build_object('label', v_pin.label, 'previous_active', v_pin.is_active),
        p_ip_hash
    );

    RETURN jsonb_build_object('success', true, 'pin_id', p_pin_id);
END;
$$;

-- 6. ATOMIC ADMIN FORCE DELETE FILE (Explicit State Accounting Matrix)
CREATE OR REPLACE FUNCTION public.admin_force_delete_file(
    p_admin_id UUID,
    p_file_id UUID,
    p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin RECORD;
    v_file RECORD;
    v_quota_action TEXT;
BEGIN
    -- 1. Verify caller is an approved admin
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND OR v_admin.role <> 'admin' OR v_admin.status <> 'approved' THEN
        RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
    END IF;

    -- 2. Lock file row
    SELECT * INTO v_file FROM public.files WHERE id = p_file_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'FILE_NOT_FOUND';
    END IF;

    -- 3. Explicit File State Accounting Matrix & Double-Reclamation Prevention
    CASE v_file.status
        WHEN 'UPLOADING' THEN
            -- In-flight upload: release reserved_bytes
            UPDATE public.profiles
            SET reserved_bytes = GREATEST(0, reserved_bytes - v_file.byte_size),
                updated_at = NOW()
            WHERE id = v_file.user_id;
            v_quota_action := 'RELEASED_RESERVED_BYTES';

        WHEN 'ACTIVE', 'EXPIRING', 'EXPIRED' THEN
            -- Committed storage: release storage_used_bytes
            UPDATE public.profiles
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - v_file.byte_size),
                updated_at = NOW()
            WHERE id = v_file.user_id;
            v_quota_action := 'RELEASED_STORAGE_USED_BYTES';

        WHEN 'DELETE_PENDING', 'DELETE_FAILED', 'PURGED' THEN
            -- Quota was already reclaimed when entering DELETE_PENDING.
            -- Zero additional quota change to prevent double reclamation.
            v_quota_action := 'NO_OP_ALREADY_RECLAIMED';

        ELSE
            -- Strict safety: explicitly reject unknown future or unexpected statuses
            RAISE EXCEPTION 'UNHANDLED_FILE_STATUS: Unexpected file status % for quota accounting', v_file.status;
    END CASE;

    -- 4. Deactivate associated active share links
    UPDATE public.share_links
    SET is_active = FALSE,
        revoked_at = NOW()
    WHERE file_id = p_file_id
      AND is_active = TRUE;

    -- 5. Transition file status if not already terminal
    IF v_file.status NOT IN ('DELETE_PENDING', 'PURGED') THEN
        UPDATE public.files
        SET status = 'DELETE_PENDING',
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = p_file_id;
    END IF;

    -- 6. Insert audit log atomically
    INSERT INTO public.audit_logs (actor_id, event_type, resource_type, resource_id, metadata, ip_hash)
    VALUES (
        p_admin_id,
        'ADMIN_FILE_FORCE_DELETE',
        'file',
        p_file_id::TEXT,
        jsonb_build_object(
            'target_user_id', v_file.user_id,
            'byte_size', v_file.byte_size,
            'previous_status', v_file.status,
            'quota_action', v_quota_action
        ),
        p_ip_hash
    );

    RETURN jsonb_build_object(
        'success', true,
        'file_id', p_file_id,
        'target_user_id', v_file.user_id,
        'previous_status', v_file.status,
        'quota_action', v_quota_action,
        'status', 'DELETE_PENDING'
    );
END;
$$;

-- ==============================================================================
-- 7. SECURITY PRIVILEGE REVOCATION & SERVICE ROLE GRANTS
-- ==============================================================================
REVOKE ALL ON FUNCTION public.admin_review_access_request(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_access_request(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_user_quota(UUID, UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_quota(UUID, UUID, BIGINT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_user_profile(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_create_onboarding_pin(UUID, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_onboarding_pin(UUID, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_revoke_onboarding_pin(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_onboarding_pin(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_force_delete_file(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_file(UUID, UUID, TEXT) TO service_role;
