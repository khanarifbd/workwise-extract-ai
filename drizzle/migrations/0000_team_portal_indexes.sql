CREATE INDEX IF NOT EXISTS idx_team_messages_team_created ON public.team_messages (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_active_updated_at ON public.jobs (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_team ON public.jobs (team) WHERE team IS NOT NULL;