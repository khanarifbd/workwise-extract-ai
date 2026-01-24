-- Add insulation_info column to jobs table (similar to fan_info)
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS insulation_info jsonb DEFAULT '[]'::jsonb;

-- Add linked_insulation_job_id column for linking DM jobs to Insulation jobs
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS linked_insulation_job_id uuid;

COMMENT ON COLUMN public.jobs.insulation_info IS 'Array of insulation units: [{type, quantity, location, thickness, material}]';
COMMENT ON COLUMN public.jobs.linked_insulation_job_id IS 'Reference to linked job in Insulation category';