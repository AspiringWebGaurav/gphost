DROP FUNCTION IF EXISTS public.reclaim_file_storage(UUID, UUID);
DROP FUNCTION IF EXISTS public.release_quota_reservation(UUID, BIGINT);
DROP FUNCTION IF EXISTS public.commit_upload_quota(UUID, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.reserve_user_quota(UUID, BIGINT);
