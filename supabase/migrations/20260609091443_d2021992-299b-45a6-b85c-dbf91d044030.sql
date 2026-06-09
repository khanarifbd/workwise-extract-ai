-- =========================================================
-- 1. SUBCONTRACTOR DIRECTORY
-- =========================================================
CREATE TABLE public.subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  phone text,
  email text,
  trade text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontractors TO authenticated;
GRANT ALL ON public.subcontractors TO service_role;

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage subcontractors"
  ON public.subcontractors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Viewers read subcontractors"
  ON public.subcontractors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'viewer') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER subcontractors_updated_at
  BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_subcontractors_active ON public.subcontractors(is_active);

-- =========================================================
-- 2. JOB ↔ EXTERNAL ASSIGNEE LINK
-- =========================================================
CREATE TABLE public.job_external_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignment_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, subcontractor_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_external_assignees TO authenticated;
GRANT ALL ON public.job_external_assignees TO service_role;

ALTER TABLE public.job_external_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage job external assignees"
  ON public.job_external_assignees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Viewers read job external assignees"
  ON public.job_external_assignees FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'viewer') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER job_external_assignees_updated_at
  BEFORE UPDATE ON public.job_external_assignees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_job_external_assignees_job ON public.job_external_assignees(job_id);
CREATE INDEX idx_job_external_assignees_sub ON public.job_external_assignees(subcontractor_id);

-- =========================================================
-- 3. EXTEND team_sign_offs FOR ADMIN OVERRIDE + EXTERNAL
-- =========================================================
ALTER TABLE public.team_sign_offs
  ADD COLUMN IF NOT EXISTS signed_off_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS on_behalf_of text NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS external_assignee_id uuid REFERENCES public.job_external_assignees(id) ON DELETE CASCADE;

-- Constrain on_behalf_of values (use trigger-free check, safe because list is immutable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_sign_offs_on_behalf_of_check'
  ) THEN
    ALTER TABLE public.team_sign_offs
      ADD CONSTRAINT team_sign_offs_on_behalf_of_check
      CHECK (on_behalf_of IN ('team','external'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_sign_offs_external ON public.team_sign_offs(external_assignee_id);

-- =========================================================
-- 4. JOB COMPLETION DERIVATION FUNCTION
-- Returns: 'pending' | 'partially_complete' | 'complete'
-- A job is complete when EVERY assigned party (team, team2, each external) has a sign-off row.
-- =========================================================
CREATE OR REPLACE FUNCTION public.derive_job_completion_state(_job_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team text;
  v_team2 text;
  v_ext_total int;
  v_ext_signed int;
  v_team_signed boolean := true;
  v_team2_signed boolean := true;
  v_any_signed boolean := false;
BEGIN
  SELECT team, team2 INTO v_team, v_team2 FROM public.jobs WHERE id = _job_id;

  IF v_team IS NOT NULL AND length(trim(v_team)) > 0 THEN
    v_team_signed := EXISTS (
      SELECT 1 FROM public.team_sign_offs
      WHERE job_id = _job_id AND team_id = v_team AND on_behalf_of = 'team'
    );
    IF v_team_signed THEN v_any_signed := true; END IF;
  END IF;

  IF v_team2 IS NOT NULL AND length(trim(v_team2)) > 0 THEN
    v_team2_signed := EXISTS (
      SELECT 1 FROM public.team_sign_offs
      WHERE job_id = _job_id AND team_id = v_team2 AND on_behalf_of = 'team'
    );
    IF v_team2_signed THEN v_any_signed := true; END IF;
  END IF;

  SELECT COUNT(*) INTO v_ext_total
  FROM public.job_external_assignees WHERE job_id = _job_id;

  SELECT COUNT(*) INTO v_ext_signed
  FROM public.team_sign_offs s
  JOIN public.job_external_assignees e ON e.id = s.external_assignee_id
  WHERE s.job_id = _job_id AND s.on_behalf_of = 'external';

  IF v_ext_signed > 0 THEN v_any_signed := true; END IF;

  IF v_team_signed AND v_team2_signed AND v_ext_signed >= v_ext_total
     AND (v_team IS NOT NULL OR v_team2 IS NOT NULL OR v_ext_total > 0) THEN
    RETURN 'complete';
  ELSIF v_any_signed THEN
    RETURN 'partially_complete';
  ELSE
    RETURN 'pending';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.derive_job_completion_state(uuid) TO authenticated, anon, service_role;
