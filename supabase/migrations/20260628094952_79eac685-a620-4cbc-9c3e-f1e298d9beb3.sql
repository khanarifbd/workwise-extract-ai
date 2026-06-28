CREATE OR REPLACE FUNCTION public.enforce_job_completion_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Completion always wins: if either completion flag is set, align every derived field.
  IF NEW.status = 'complete' OR COALESCE(NEW.is_completed, false) = true THEN
    NEW.status := 'complete';
    NEW.is_completed := true;
    NEW.progress := 100;
    NEW.completion_date := COALESCE(NEW.completion_date, now());

    -- A job cannot be both complete and referred back in the analytics model.
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

-- Repair existing drift so the current dashboard immediately reconciles.
UPDATE public.jobs
SET
  status = 'complete',
  is_completed = true,
  progress = 100,
  completion_date = COALESCE(completion_date, updated_at, now()),
  refer_back = false,
  refer_back_date = NULL,
  updated_at = now()
WHERE deleted_at IS NULL
  AND (status = 'complete' OR COALESCE(is_completed, false) = true)
  AND (
    status IS DISTINCT FROM 'complete'
    OR COALESCE(is_completed, false) IS DISTINCT FROM true
    OR progress IS DISTINCT FROM 100
    OR completion_date IS NULL
    OR COALESCE(refer_back, false) IS DISTINCT FROM false
  );