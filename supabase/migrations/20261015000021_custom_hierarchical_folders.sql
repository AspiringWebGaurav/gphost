-- ==============================================================================
-- GPHosting Migration 021: Custom Hierarchical Folder Management
-- Supports unlimited nested folders (e.g. GPN -> 1 -> 2)
-- Enables atomic folder CRUD, parent-child navigation, and tenant isolation
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    parent_path TEXT,
    depth INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_folder_path UNIQUE (user_id, path)
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON public.folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_path ON public.folders(user_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_folders_path ON public.folders(user_id, path);

-- Enable Row Level Security
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
CREATE POLICY "Users can view their own folders"
    ON public.folders FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own folders" ON public.folders;
CREATE POLICY "Users can insert their own folders"
    ON public.folders FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
CREATE POLICY "Users can update their own folders"
    ON public.folders FOR UPDATE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
CREATE POLICY "Users can delete their own folders"
    ON public.folders FOR DELETE
    USING (user_id = auth.uid());

GRANT ALL ON TABLE public.folders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.folders TO authenticated;
