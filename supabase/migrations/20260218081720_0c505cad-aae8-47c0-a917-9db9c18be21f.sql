
-- Step 1: Add 'job_progressor' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'job_progressor';
