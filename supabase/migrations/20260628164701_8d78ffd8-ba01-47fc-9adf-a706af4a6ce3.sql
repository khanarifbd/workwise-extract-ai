CREATE OR REPLACE FUNCTION public.enforce_job_completion_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  latest_signoff timestamptz;
BEGIN
  IF NEW.status = 'complete' OR COALESCE(NEW.is_completed, false) = true THEN
    NEW.status := 'complete';
    NEW.is_completed := true;
    NEW.progress := 100;

    IF NEW.completion_date IS NULL THEN
      SELECT MAX(signed_off_at)
      INTO latest_signoff
      FROM public.team_sign_offs
      WHERE job_id = NEW.id;

      NEW.completion_date := COALESCE(latest_signoff, now());
    END IF;

    NEW.refer_back := false;
    NEW.refer_back_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_job_completion_consistency ON public.jobs;
CREATE TRIGGER trg_enforce_job_completion_consistency
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_job_completion_consistency();

WITH latest AS (
  SELECT job_id, MAX(signed_off_at) AS signed_off_at
  FROM public.team_sign_offs
  GROUP BY job_id
)
UPDATE public.jobs j
SET completion_date = latest.signed_off_at
FROM latest
WHERE j.id = latest.job_id
  AND j.deleted_at IS NULL
  AND (j.status = 'complete' OR COALESCE(j.is_completed, false) = true)
  AND j.completion_date IS DISTINCT FROM latest.signed_off_at;