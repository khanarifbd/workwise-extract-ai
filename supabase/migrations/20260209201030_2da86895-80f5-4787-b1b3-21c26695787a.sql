
-- Add soft-delete column
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT null;

-- Create index for efficient filtering of non-deleted jobs
CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at ON public.jobs (deleted_at) WHERE deleted_at IS NULL;
