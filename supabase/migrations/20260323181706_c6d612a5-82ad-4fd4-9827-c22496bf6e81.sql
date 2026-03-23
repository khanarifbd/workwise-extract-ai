CREATE OR REPLACE FUNCTION public.auto_refer_back_on_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  contact_count integer;
  job_already_referred boolean;
  job_booked_date timestamptz;
  job_status text;
  job_is_completed boolean;
  has_pending_trade_booking boolean;
BEGIN
  -- Count total contact attempts for this job
  SELECT COUNT(*) INTO contact_count
  FROM public.contact_history
  WHERE job_id = NEW.job_id;

  -- Fetch current job state
  SELECT
    COALESCE(refer_back, false),
    booked_date,
    status,
    COALESCE(is_completed, false)
  INTO
    job_already_referred,
    job_booked_date,
    job_status,
    job_is_completed
  FROM public.jobs
  WHERE id = NEW.job_id;

  -- Detect active trade booking on pending subtasks
  SELECT EXISTS (
    SELECT 1
    FROM public.job_sub_tasks st
    WHERE st.parent_job_id = NEW.job_id
      AND st.booked_date IS NOT NULL
      AND st.status NOT IN ('completed_awaiting_portal', 'completed_signed_off')
      AND st.completion_date IS NULL
  )
  INTO has_pending_trade_booking;

  -- Auto refer back only when there are 3+ attempts WITHOUT any active booking
  IF contact_count >= 3
    AND NOT job_already_referred
    AND NOT job_is_completed
    AND COALESCE(job_status, '') <> 'complete'
    AND job_booked_date IS NULL
    AND NOT has_pending_trade_booking
  THEN
    UPDATE public.jobs
    SET refer_back = true,
        refer_back_reason = COALESCE(refer_back_reason, '') || CASE WHEN COALESCE(refer_back_reason, '') = '' THEN '' ELSE '; ' END || 'Auto: 3+ contact attempts without booking',
        refer_back_date = now()
    WHERE id = NEW.job_id
      AND NOT refer_back;
  END IF;

  RETURN NEW;
END;
$$;