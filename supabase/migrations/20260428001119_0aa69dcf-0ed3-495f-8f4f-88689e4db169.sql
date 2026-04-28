CREATE TABLE public.eod_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id text NOT NULL,
  team_name text NOT NULL,
  report_date date NOT NULL DEFAULT (now() AT TIME ZONE 'GMT')::date,
  jobs_visited jsonb NOT NULL DEFAULT '[]'::jsonb,
  jobs_completed jsonb NOT NULL DEFAULT '[]'::jsonb,
  jobs_open jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_reasons text DEFAULT '',
  general_notes text DEFAULT '',
  submitted_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, report_date)
);

CREATE INDEX idx_eod_reports_date ON public.eod_reports (report_date DESC);
CREATE INDEX idx_eod_reports_team ON public.eod_reports (team_id, report_date DESC);

ALTER TABLE public.eod_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage EOD reports"
  ON public.eod_reports FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Viewers view EOD reports"
  ON public.eod_reports FOR SELECT
  USING (is_viewer(auth.uid()) OR is_job_progressor(auth.uid()));

CREATE POLICY "Service role manages EOD reports"
  ON public.eod_reports FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Valid teams insert their EOD"
  ON public.eod_reports FOR INSERT
  WITH CHECK (is_valid_team_id(team_id));

CREATE POLICY "Valid teams view their EOD"
  ON public.eod_reports FOR SELECT
  USING (is_valid_team_id(team_id));

CREATE POLICY "Valid teams update their EOD"
  ON public.eod_reports FOR UPDATE
  USING (is_valid_team_id(team_id));

CREATE TRIGGER update_eod_reports_updated_at
  BEFORE UPDATE ON public.eod_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();