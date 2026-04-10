ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS flooring_info jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS linked_flooring_job_id uuid DEFAULT NULL;