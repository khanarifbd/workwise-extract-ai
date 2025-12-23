-- Add costs JSON field to jobs table for storing material, labour, and other costs
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS costs jsonb DEFAULT '{"materials": 0, "labour": 0, "other": 0, "notes": ""}'::jsonb;