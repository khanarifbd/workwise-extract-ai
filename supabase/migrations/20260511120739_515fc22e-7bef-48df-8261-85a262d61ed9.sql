
CREATE TABLE public.materials_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Materials Report',
  created_by text,
  job_ids uuid[] NOT NULL DEFAULT '{}',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  job_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.materials_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage materials reports"
ON public.materials_reports FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Viewers view materials reports"
ON public.materials_reports FOR SELECT
USING (is_viewer(auth.uid()) OR is_job_progressor(auth.uid()));

CREATE POLICY "Service role manages materials reports"
ON public.materials_reports FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_materials_reports_updated_at
BEFORE UPDATE ON public.materials_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_materials_reports_created_at ON public.materials_reports(created_at DESC);
