CREATE TABLE public.progressor_diary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NULL,
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  scheduled_at timestamptz NOT NULL,
  notify_at timestamptz NULL,
  notify_enabled boolean NOT NULL DEFAULT false,
  notified boolean NOT NULL DEFAULT false,
  is_done boolean NOT NULL DEFAULT false,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prog_diary_scheduled_at ON public.progressor_diary_entries (scheduled_at);
CREATE INDEX idx_prog_diary_job_id ON public.progressor_diary_entries (job_id);

ALTER TABLE public.progressor_diary_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage progressor diary"
  ON public.progressor_diary_entries
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Job progressors manage progressor diary"
  ON public.progressor_diary_entries
  FOR ALL
  USING (is_job_progressor(auth.uid()))
  WITH CHECK (is_job_progressor(auth.uid()));

CREATE POLICY "Service role manages progressor diary"
  ON public.progressor_diary_entries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Viewers can view progressor diary"
  ON public.progressor_diary_entries
  FOR SELECT
  USING (is_viewer(auth.uid()));

CREATE TRIGGER trg_prog_diary_updated_at
  BEFORE UPDATE ON public.progressor_diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();