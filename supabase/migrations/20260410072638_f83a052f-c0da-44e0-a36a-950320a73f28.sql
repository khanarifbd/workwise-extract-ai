
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS roofing_info jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_roofing_job_id uuid;
