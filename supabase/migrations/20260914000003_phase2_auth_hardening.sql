-- ==============================================================================
-- GPHosting Migration 003: Phase 2 Auth Hardening & Atomic PIN Redemption
-- Project: GPHosting (https://gphost.eu.cc)
-- Source of Truth: Master Implementation Plan Revision 3.1
-- ==============================================================================

-- 1. Database-enforced Access Request Concurrency Invariant:
-- Guarantees each user can have at most ONE pending access request at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_unique_pending
ON public.access_requests(user_id)
WHERE status = 'pending';

-- 2. Authoritative Atomic PIN Redemption Transaction Function
CREATE OR REPLACE FUNCTION public.redeem_onboarding_pin(
    p_pin_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_pin_id UUID;
    v_current_status user_status;
BEGIN
    -- Step A: Check user profile existence and current status
    SELECT status INTO v_current_status
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;

    IF v_current_status = 'approved' THEN
        RETURN TRUE; -- Idempotent success if already approved
    END IF;

    -- Step B: Atomically consume PIN with strict row-level locking condition
    UPDATE public.onboarding_pins
    SET times_used = times_used + 1,
        is_active = CASE 
            WHEN max_uses IS NOT NULL AND times_used + 1 >= max_uses THEN FALSE 
            ELSE is_active 
        END,
        updated_at = NOW()
    WHERE id = p_pin_id
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (max_uses IS NULL OR times_used < max_uses)
    RETURNING id INTO v_updated_pin_id;

    IF v_updated_pin_id IS NULL THEN
        RAISE EXCEPTION 'PIN is invalid, inactive, expired, or already fully consumed';
    END IF;

    -- Step C: Atomically update user status to approved in the same transaction
    UPDATE public.profiles
    SET status = 'approved',
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Step D: Record audit log entry in the same transaction
    INSERT INTO public.audit_logs (
        actor_id,
        event_type,
        resource_type,
        resource_id,
        ip_hash,
        metadata
    ) VALUES (
        p_user_id,
        'PIN_ONBOARDING_SUCCESS',
        'onboarding_pin',
        p_pin_id::TEXT,
        'server_authoritative',
        jsonb_build_object(
            'method', 'onboarding_pin',
            'timestamp', NOW()
        )
    );

    RETURN TRUE;
END;
$$;

-- Restrict execution to backend service_role only
REVOKE ALL ON FUNCTION public.redeem_onboarding_pin(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_onboarding_pin(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_onboarding_pin(UUID, UUID) TO service_role;
