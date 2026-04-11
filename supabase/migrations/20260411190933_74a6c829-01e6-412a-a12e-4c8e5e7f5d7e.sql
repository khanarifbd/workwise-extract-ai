
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS fire_door_info jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS linked_fire_door_job_id uuid DEFAULT NULL;
