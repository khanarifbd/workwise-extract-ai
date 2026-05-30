CREATE TABLE public.job_control_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL,
  problem_type text NOT NULL,
  problem_description text NOT NULL DEFAULT '',
  next_action text NOT NULL,
  action_details text NOT NULL DEFAULT '',
  assigned_to text NOT NULL,
  deadline timestamptz,
  status text NOT NULL DEFAULT 'open',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_control_records_job_id ON public.job_control_records(job_id);
CREATE INDEX idx_job_control_records_status ON public.job_control_records(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_control_records TO authenticated;
GRANT ALL ON public.job_control_records TO service_role;

ALTER TABLE public.job_control_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage control records"
ON public.job_control_records
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Job progressors can manage control records"
ON public.job_control_records
FOR ALL
TO authenticated
USING (is_job_progressor(auth.uid()))
WITH CHECK (is_job_progressor(auth.uid()));

CREATE POLICY "Viewers can view control records"
ON public.job_control_records
FOR SELECT
TO authenticated
USING (is_viewer(auth.uid()));

CREATE POLICY "Service role can manage control records"
ON public.job_control_records
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_job_control_records_updated_at
BEFORE UPDATE ON public.job_control_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();