
CREATE TABLE public.danni_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_name text,
  note_text text NOT NULL DEFAULT '',
  alert_date timestamp with time zone,
  alert_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.danni_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage danni notes" ON public.danni_notes
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role can manage danni notes" ON public.danni_notes
  FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Viewers can view danni notes" ON public.danni_notes
  FOR SELECT TO public USING (is_viewer(auth.uid()));
