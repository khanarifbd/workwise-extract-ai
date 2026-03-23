
-- Trigger function: when a sub-task booked_date is inserted/updated,
-- update the parent job's booked_date to the earliest PENDING sub-task date.
CREATE OR REPLACE FUNCTION public.sync_job_booked_date_from_subtasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _earliest_pending_date timestamptz;
  _parent_id uuid;
BEGIN
  -- Determine which parent job to update
  IF TG_OP = 'DELETE' THEN
    _parent_id := OLD.parent_job_id;
  ELSE
    _parent_id := NEW.parent_job_id;
  END IF;

  -- Find the earliest booked_date among non-completed sub-tasks
  SELECT MIN(st.booked_date)
  INTO _earliest_pending_date
  FROM public.job_sub_tasks st
  WHERE st.parent_job_id = _parent_id
    AND st.booked_date IS NOT NULL
    AND st.status NOT IN ('completed_awaiting_portal', 'completed_signed_off')
    AND st.completion_date IS NULL;

  -- Only update if we found a pending trade date
  IF _earliest_pending_date IS NOT NULL THEN
    UPDATE public.jobs
    SET booked_date = _earliest_pending_date,
        updated_at = now()
    WHERE id = _parent_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger on job_sub_tasks
DROP TRIGGER IF EXISTS trg_sync_job_booked_date ON public.job_sub_tasks;
CREATE TRIGGER trg_sync_job_booked_date
  AFTER INSERT OR UPDATE OF booked_date, status, completion_date
  ON public.job_sub_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_job_booked_date_from_subtasks();

-- Also handle deletes
DROP TRIGGER IF EXISTS trg_sync_job_booked_date_delete ON public.job_sub_tasks;
CREATE TRIGGER trg_sync_job_booked_date_delete
  AFTER DELETE
  ON public.job_sub_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_job_booked_date_from_subtasks();

-- Fix existing jobs: update booked_date to match earliest pending sub-task date
UPDATE public.jobs j
SET booked_date = sub.earliest_date,
    updated_at = now()
FROM (
  SELECT st.parent_job_id, MIN(st.booked_date) as earliest_date
  FROM public.job_sub_tasks st
  WHERE st.booked_date IS NOT NULL
    AND st.status NOT IN ('completed_awaiting_portal', 'completed_signed_off')
    AND st.completion_date IS NULL
  GROUP BY st.parent_job_id
) sub
WHERE j.id = sub.parent_job_id
  AND j.deleted_at IS NULL
  AND (j.booked_date IS NULL OR j.booked_date != sub.earliest_date);
