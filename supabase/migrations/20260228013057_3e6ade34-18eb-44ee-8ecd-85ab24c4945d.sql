
-- Add expected_completion_date column for progressor to set target completion
ALTER TABLE public.jobs ADD COLUMN expected_completion_date timestamp with time zone DEFAULT NULL;
