
-- Fix #1: Allow job progressors to INSERT sub-tasks
CREATE POLICY "Job progressors can insert sub tasks"
ON public.job_sub_tasks
FOR INSERT
WITH CHECK (is_job_progressor(auth.uid()));

-- Fix #3: Create trade companies table for contractor contacts
CREATE TABLE public.trade_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  trade TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage trade companies"
ON public.trade_companies FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Job progressors can view trade companies"
ON public.trade_companies FOR SELECT
USING (is_job_progressor(auth.uid()));

CREATE POLICY "Job progressors can manage trade companies"
ON public.trade_companies FOR ALL
USING (is_job_progressor(auth.uid()))
WITH CHECK (is_job_progressor(auth.uid()));

CREATE POLICY "Viewers can view trade companies"
ON public.trade_companies FOR SELECT
USING (is_viewer(auth.uid()));

CREATE POLICY "Service role can manage trade companies"
ON public.trade_companies FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Trigger for updated_at
CREATE TRIGGER update_trade_companies_updated_at
BEFORE UPDATE ON public.trade_companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Also allow job progressors to update jobs (needed for parent job status update on sub-task creation)
CREATE POLICY "Job progressors can update jobs"
ON public.jobs
FOR UPDATE
USING (is_job_progressor(auth.uid()));
