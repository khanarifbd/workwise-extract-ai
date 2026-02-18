
-- 2. Create helper function for job_progressor role check
CREATE OR REPLACE FUNCTION public.is_job_progressor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'job_progressor')
$$;

-- 3. Update has_admin_access to include job_progressor
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'viewer', 'job_progressor')
  )
$$;

-- 4. Create trade_types table
CREATE TABLE public.trade_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone with admin access can view trade types"
  ON public.trade_types FOR SELECT
  USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage trade types"
  ON public.trade_types FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role can manage trade types"
  ON public.trade_types FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Insert default trades
INSERT INTO public.trade_types (name, sort_order) VALUES
  ('Roofing', 1),
  ('UPVC Doors', 2),
  ('UPVC Windows', 3),
  ('Polysafe Flooring', 4),
  ('Plastering', 5),
  ('Electrical', 6),
  ('Plumbing', 7),
  ('Decoration', 8),
  ('Other', 99);

-- 5. Create job_sub_tasks table
CREATE TABLE public.job_sub_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  trade text NOT NULL,
  assigned_team text,
  tenant_name text,
  property_address text,
  description text,
  photos text[] DEFAULT '{}',
  booked_date timestamptz,
  deadline_date timestamptz,
  completion_date timestamptz,
  status text NOT NULL DEFAULT 'not_scheduled',
  portal_updated boolean NOT NULL DEFAULT false,
  signed_off boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_sub_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sub tasks"
  ON public.job_sub_tasks FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Job progressors can view sub tasks"
  ON public.job_sub_tasks FOR SELECT
  USING (public.is_job_progressor(auth.uid()));

CREATE POLICY "Job progressors can update sub tasks"
  ON public.job_sub_tasks FOR UPDATE
  USING (public.is_job_progressor(auth.uid()));

CREATE POLICY "Viewers can view sub tasks"
  ON public.job_sub_tasks FOR SELECT
  USING (public.is_viewer(auth.uid()));

CREATE POLICY "Service role can manage sub tasks"
  ON public.job_sub_tasks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_sub_tasks_parent_job ON public.job_sub_tasks(parent_job_id);
CREATE INDEX idx_sub_tasks_status ON public.job_sub_tasks(status);
CREATE INDEX idx_sub_tasks_deadline ON public.job_sub_tasks(deadline_date);

CREATE TRIGGER update_sub_tasks_updated_at
  BEFORE UPDATE ON public.job_sub_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Create audit_log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_role text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  field_changed text,
  old_value text,
  new_value text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_log FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage audit logs"
  ON public.audit_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Job progressors can view audit logs"
  ON public.audit_log FOR SELECT
  USING (public.is_job_progressor(auth.uid()));

CREATE INDEX idx_audit_log_record ON public.audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);

-- 7. Enable realtime for sub_tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_sub_tasks;

-- 8. RLS policies for job_progressor on existing tables
CREATE POLICY "Job progressors can view all jobs"
  ON public.jobs FOR SELECT
  USING (public.is_job_progressor(auth.uid()));

CREATE POLICY "Job progressors can view contact history"
  ON public.contact_history FOR SELECT
  USING (public.is_job_progressor(auth.uid()));

CREATE POLICY "Job progressors can view sign-offs"
  ON public.team_sign_offs FOR SELECT
  USING (public.is_job_progressor(auth.uid()));

CREATE POLICY "Job progressors can view notification settings"
  ON public.team_notification_settings FOR SELECT
  USING (public.is_job_progressor(auth.uid()));

CREATE POLICY "Job progressors can view categories"
  ON public.categories FOR SELECT
  USING (public.is_job_progressor(auth.uid()));
