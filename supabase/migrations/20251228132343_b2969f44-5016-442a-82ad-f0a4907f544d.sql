-- Create a function to notify the edge function about job changes
CREATE OR REPLACE FUNCTION public.notify_job_changes()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
BEGIN
  -- Build the payload
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );
  
  -- Log for debugging
  RAISE LOG 'Job change detected: %', payload;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for job changes
DROP TRIGGER IF EXISTS job_changes_notification_trigger ON public.jobs;
CREATE TRIGGER job_changes_notification_trigger
  AFTER INSERT OR UPDATE OF team, status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_job_changes();