-- Speeds up OverdueJobsDashboard / Danni count / booked dashboard reads.
CREATE INDEX IF NOT EXISTS idx_jobs_dashboard_active
  ON public.jobs (category_id, booked_date)
  WHERE deleted_at IS NULL
    AND is_completed = false
    AND refer_back = false;

CREATE INDEX IF NOT EXISTS idx_jobs_booked_date_active
  ON public.jobs (booked_date)
  WHERE deleted_at IS NULL
    AND booked_date IS NOT NULL;

ANALYZE public.jobs;
ANALYZE public.team_sign_offs;