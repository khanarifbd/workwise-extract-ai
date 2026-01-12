-- Add team2 column for dual-team assignment
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS team2 text;

-- Add comment to explain the column
COMMENT ON COLUMN public.jobs.team2 IS 'Second team assigned to the job (optional)';

-- Create index for team2 queries
CREATE INDEX IF NOT EXISTS idx_jobs_team2 ON public.jobs(team2) WHERE team2 IS NOT NULL;