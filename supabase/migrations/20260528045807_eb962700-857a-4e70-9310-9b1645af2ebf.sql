CREATE TABLE public.team_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text NOT NULL UNIQUE,
  team_name text NOT NULL,
  skills text[] NOT NULL DEFAULT '{}',
  strengths text NOT NULL DEFAULT '',
  weaknesses text NOT NULL DEFAULT '',
  proficiency_level text NOT NULL DEFAULT 'experienced',
  max_daily_jobs integer NOT NULL DEFAULT 3,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_skills TO authenticated;
GRANT ALL ON public.team_skills TO service_role;

ALTER TABLE public.team_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage team skills" ON public.team_skills
  FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Progressors view team skills" ON public.team_skills
  FOR SELECT USING (is_job_progressor(auth.uid()));

CREATE POLICY "Viewers view team skills" ON public.team_skills
  FOR SELECT USING (is_viewer(auth.uid()));

CREATE POLICY "Service role manages team skills" ON public.team_skills
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_team_skills_updated_at
  BEFORE UPDATE ON public.team_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();