
CREATE INDEX IF NOT EXISTS idx_jobs_category_date_active
  ON public.jobs (category_id, date_issued DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_date_issued_active
  ON public.jobs (date_issued DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_sign_offs_job_id
  ON public.team_sign_offs (job_id);

CREATE INDEX IF NOT EXISTS idx_team_availability_team_date
  ON public.team_availability (team_id, unavailable_date);

ANALYZE public.jobs;
ANALYZE public.team_sign_offs;
ANALYZE public.team_availability;
