-- Add private_notes column to jobs table (admin only, not visible in team portal)
ALTER TABLE public.jobs ADD COLUMN private_notes text DEFAULT '';