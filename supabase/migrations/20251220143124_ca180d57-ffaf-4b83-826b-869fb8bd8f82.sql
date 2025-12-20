-- Add fan_info and linked_fan_job_id columns to jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS fan_info jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS linked_fan_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;