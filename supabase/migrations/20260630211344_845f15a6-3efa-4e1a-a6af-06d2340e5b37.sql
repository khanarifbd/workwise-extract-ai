UPDATE public.categories
SET sort_order = CASE
  WHEN slug = 'dm-jobs' THEN 0
  WHEN slug IN ('a--a', 'a-a') OR lower(name) IN ('a & a', 'a&a', 'a and a') THEN 1
  WHEN slug = 'insulation' THEN 2
  WHEN slug = 'roofing' THEN 3
  ELSE sort_order + 100
END
WHERE slug IN ('dm-jobs', 'a--a', 'a-a', 'insulation', 'roofing')
   OR lower(name) IN ('a & a', 'a&a', 'a and a');

CREATE INDEX IF NOT EXISTS idx_jobs_active_category_date_id
ON public.jobs (category_id, date_issued DESC, id DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_active_date_id
ON public.jobs (date_issued DESC, id DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_sub_tasks_booked_date_v2
ON public.job_sub_tasks (booked_date, parent_job_id)
WHERE booked_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_team_sign_offs_latest
ON public.team_sign_offs (job_id, signed_off_at DESC);