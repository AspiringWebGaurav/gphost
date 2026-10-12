-- ==============================================================================
-- Migration: 20261012000016_gpn_atomic_releases.sql
-- Description:
--   1. Creates public.app_releases for atomic, immutable, and synchronized releases
--   2. Enforces partial unique index for strictly <= 1 active release per app
--   3. Adds immutability trigger preventing modification of published releases
--   4. Creates atomic publish_app_release stored procedure with advisory lock
--   5. Configures Row Level Security and permissions
-- ==============================================================================

-- 1. Create app_releases table
CREATE TABLE IF NOT EXISTS public.app_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id TEXT NOT NULL DEFAULT 'gpn',
    version TEXT NOT NULL,
    binary_file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE RESTRICT,
    binary_r2_key TEXT NOT NULL,
    binary_sha256 TEXT NOT NULL,
    binary_byte_size BIGINT NOT NULL,
    signature_text TEXT NOT NULL,
    signature_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
    release_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT check_release_byte_size CHECK (binary_byte_size > 0),
    CONSTRAINT uq_app_releases_version UNIQUE (app_id, version)
);

-- 2. Partial unique index: Exactly one active release per app
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_releases_single_active 
ON public.app_releases (app_id) 
WHERE is_active = TRUE;

-- 3. Query performance indexes
CREATE INDEX IF NOT EXISTS idx_app_releases_lookup ON public.app_releases(app_id, is_active);
CREATE INDEX IF NOT EXISTS idx_app_releases_published_at ON public.app_releases(app_id, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_app_releases_created_at ON public.app_releases(created_at DESC);

-- 4. Database-level immutability trigger for published releases
CREATE OR REPLACE FUNCTION public.prevent_published_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Once published, the core release parameters cannot be tampered with
  IF OLD.is_published = true THEN
    IF NEW.version <> OLD.version 
       OR NEW.app_id <> OLD.app_id 
       OR NEW.binary_file_id <> OLD.binary_file_id 
       OR NEW.binary_sha256 <> OLD.binary_sha256 
       OR NEW.signature_text <> OLD.signature_text THEN
      RAISE EXCEPTION 'Published release records are immutable. Version: %, App: %', OLD.version, OLD.app_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_published_releases ON public.app_releases;
CREATE TRIGGER trg_immutable_published_releases
BEFORE UPDATE ON public.app_releases
FOR EACH ROW
EXECUTE FUNCTION public.prevent_published_release_mutation();

-- 5. Atomic release activation procedure with advisory transaction lock and pre-validation
CREATE OR REPLACE FUNCTION public.publish_app_release(p_app_id text, p_release_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Advisory transaction lock prevents concurrent publications from racing
  PERFORM pg_advisory_xact_lock(hashtext('release_publish_' || p_app_id));
  
  -- Pre-validate: Target release MUST exist and belong to the requested app
  IF NOT EXISTS (
    SELECT 1 FROM public.app_releases 
    WHERE id = p_release_id AND app_id = p_app_id
  ) THEN
    RAISE EXCEPTION 'Target release % does not exist for app %', p_release_id, p_app_id;
  END IF;

  -- Deactivate current active release
  UPDATE public.app_releases
  SET is_active = false, updated_at = now()
  WHERE app_id = p_app_id AND is_active = true;

  -- Atomically activate target release and mark as published
  UPDATE public.app_releases
  SET is_active = true, 
      is_published = true, 
      published_at = COALESCE(published_at, now()), 
      updated_at = now()
  WHERE id = p_release_id AND app_id = p_app_id;
END;
$$;

-- Restrict procedure execution to service_role only (prevents direct execution by anon/authenticated)
REVOKE EXECUTE ON FUNCTION public.publish_app_release(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_app_release(text, uuid) TO service_role;

-- 6. Row Level Security policies
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

-- Anyone can read the active release (updater manifest lookup)
DROP POLICY IF EXISTS "Anyone can view active releases" ON public.app_releases;
CREATE POLICY "Anyone can view active releases"
    ON public.app_releases
    FOR SELECT
    USING (is_active = true);

-- Authoritative owner / admin can view all releases (strictly gauravpatil5737@gmail.com)
DROP POLICY IF EXISTS "Admins can view all releases" ON public.app_releases;
CREATE POLICY "Admins can view all releases"
    ON public.app_releases
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND (
                p.role = 'admin' 
                OR p.email = 'gauravpatil5737@gmail.com'
            )
        )
    );

-- Service role full management
DROP POLICY IF EXISTS "Service role can manage releases" ON public.app_releases;
CREATE POLICY "Service role can manage releases"
    ON public.app_releases
    FOR ALL
    USING (TRUE)
    WITH CHECK (TRUE);

-- Grant table access: anon and authenticated may only SELECT (subject to RLS); service_role manages all
REVOKE ALL ON TABLE public.app_releases FROM anon, authenticated;
GRANT SELECT ON TABLE public.app_releases TO anon, authenticated;
GRANT ALL ON TABLE public.app_releases TO postgres, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
