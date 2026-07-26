CREATE TABLE public.job_admin_secure_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  author_name text,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_admin_secure_notes_job_id ON public.job_admin_secure_notes(job_id);

GRANT ALL ON public.job_admin_secure_notes TO service_role;

ALTER TABLE public.job_admin_secure_notes ENABLE ROW LEVEL SECURITY;

-- No client role has any privileges. All access must go through the
-- secure-job-notes edge function (which uses the service role + code check).
CREATE POLICY "No direct client access to secure notes"
  ON public.job_admin_secure_notes
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE TRIGGER update_job_admin_secure_notes_updated_at
  BEFORE UPDATE ON public.job_admin_secure_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();