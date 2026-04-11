
CREATE TABLE public.admin_personal_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_name TEXT NOT NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  note_text TEXT NOT NULL,
  alert_date TIMESTAMPTZ,
  alert_dismissed BOOLEAN NOT NULL DEFAULT false,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_personal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage personal notes"
ON public.admin_personal_notes
FOR ALL
TO authenticated
USING (public.has_admin_access(auth.uid()))
WITH CHECK (public.has_admin_access(auth.uid()));

CREATE INDEX idx_admin_notes_admin_name ON public.admin_personal_notes(admin_name);
CREATE INDEX idx_admin_notes_job_id ON public.admin_personal_notes(job_id);
CREATE INDEX idx_admin_notes_alert_date ON public.admin_personal_notes(alert_date) WHERE alert_date IS NOT NULL AND alert_dismissed = false;

CREATE TRIGGER update_admin_personal_notes_updated_at
BEFORE UPDATE ON public.admin_personal_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
