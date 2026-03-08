
-- 1. Progressor To-Do List items per job
CREATE TABLE public.progressor_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  custom_text text DEFAULT '',
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text DEFAULT 'Progressor'
);

ALTER TABLE public.progressor_todos ENABLE ROW LEVEL SECURITY;

-- RLS: Admins and job_progressors can manage
CREATE POLICY "Admins can manage progressor todos"
  ON public.progressor_todos FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Job progressors can manage progressor todos"
  ON public.progressor_todos FOR ALL
  USING (public.is_job_progressor(auth.uid()))
  WITH CHECK (public.is_job_progressor(auth.uid()));

CREATE POLICY "Service role can manage progressor todos"
  ON public.progressor_todos FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Progressor Team Access Codes (separate from team portal codes)
CREATE TABLE public.progressor_team_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL,
  access_code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text DEFAULT 'Progressor'
);

ALTER TABLE public.progressor_team_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage progressor team codes"
  ON public.progressor_team_codes FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Job progressors can manage progressor team codes"
  ON public.progressor_team_codes FOR ALL
  USING (public.is_job_progressor(auth.uid()))
  WITH CHECK (public.is_job_progressor(auth.uid()));

CREATE POLICY "Service role can manage progressor team codes"
  ON public.progressor_team_codes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Update trigger for updated_at
CREATE TRIGGER update_progressor_todos_updated_at
  BEFORE UPDATE ON public.progressor_todos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_progressor_team_codes_updated_at
  BEFORE UPDATE ON public.progressor_team_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
