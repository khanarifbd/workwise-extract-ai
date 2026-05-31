
-- 1. Soft-delete the 6 duplicate rows (keeping the best row in each group)
UPDATE public.jobs SET deleted_at = now(), updated_at = now()
WHERE id IN (
  'b49ee9d7-810f-4aa4-850d-d070edd1ced2', -- JOB-559297-FAN stale booking
  '324c070b-c1e6-44f6-a136-2740bed1236d', -- JOB-559297-FAN empty re-import
  'ba40b2f6-bfac-42b8-94e0-d413d4a788c2', -- N2581143 duplicate
  'c57b547c-c2a4-4f2a-9f6a-3fbd7b471f7d', -- N2581165-FAN stale
  '84757fb5-7bc2-4780-8813-ca0d591c2778', -- N2584944-FAN older
  '68c63f81-3db4-4931-b5b3-a096e789a178'  -- N2649468-FAN double-click
);

-- 2. Enforce uniqueness on active job_number (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS jobs_job_number_active_unique
  ON public.jobs (lower(job_number))
  WHERE deleted_at IS NULL;
