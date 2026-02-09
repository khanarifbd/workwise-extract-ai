
-- Add refer_back columns to jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS refer_back boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS refer_back_reason text DEFAULT '';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS refer_back_date timestamp with time zone DEFAULT null;

-- Create a function that auto-sets refer_back when a job reaches 3 contact attempts
CREATE OR REPLACE FUNCTION public.auto_refer_back_on_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  contact_count integer;
  job_already_referred boolean;
BEGIN
  -- Count total contact attempts for this job
  SELECT COUNT(*) INTO contact_count
  FROM public.contact_history
  WHERE job_id = NEW.job_id;

  -- Check if already referred back
  SELECT refer_back INTO job_already_referred
  FROM public.jobs
  WHERE id = NEW.job_id;

  -- Auto refer back when 3+ attempts and not already referred
  IF contact_count >= 3 AND NOT COALESCE(job_already_referred, false) THEN
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

-- Create trigger on contact_history inserts
CREATE TRIGGER trigger_auto_refer_back
AFTER INSERT ON public.contact_history
FOR EACH ROW
EXECUTE FUNCTION public.auto_refer_back_on_contact();
