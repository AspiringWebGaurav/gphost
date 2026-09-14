-- ==============================================================================
-- Migration Rollback: 20260914000005_phase4_download_engine.down.sql
-- ==============================================================================

DROP FUNCTION IF EXISTS public.reconcile_single_use_file(UUID);
DROP FUNCTION IF EXISTS public.rollback_download_claim(UUID, TEXT);
DROP FUNCTION IF EXISTS public.acquire_download_claim_lease(TEXT, TEXT, TEXT, TEXT);
