-- Make tester a dedicated read-only preview role.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tester';

CREATE OR REPLACE FUNCTION public.is_tester(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'tester'::public.app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.is_tester(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_tester(uuid) TO authenticated;

-- Treat testers as read-only viewers for existing read policies only.
-- This does not grant admin permissions because write policies continue to use is_admin/has_role('admin').
CREATE OR REPLACE FUNCTION public.is_viewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'viewer'::public.app_role)
      OR public.has_role(_user_id, 'tester'::public.app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.is_viewer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_viewer(uuid) TO authenticated;

-- Keep this helper admin-only; do not include viewer/tester.
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.has_admin_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_admin_access(uuid) TO authenticated;

-- Command Center: allow preview testers/viewers to read the live log, while writes remain admin-only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'command_events'
      AND policyname = 'Read-only users can read command_events'
  ) THEN
    CREATE POLICY "Read-only users can read command_events"
      ON public.command_events
      FOR SELECT
      TO authenticated
      USING (public.is_viewer(auth.uid()) OR public.is_tester(auth.uid()));
  END IF;
END $$;

-- Supporting read-only data for end-to-end preview testing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_external_assignees'
      AND policyname = 'Read-only users can read job external assignees'
  ) THEN
    CREATE POLICY "Read-only users can read job external assignees"
      ON public.job_external_assignees
      FOR SELECT
      TO authenticated
      USING (public.is_viewer(auth.uid()) OR public.is_tester(auth.uid()) OR public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subcontractors'
      AND policyname = 'Read-only users can read subcontractors'
  ) THEN
    CREATE POLICY "Read-only users can read subcontractors"
      ON public.subcontractors
      FOR SELECT
      TO authenticated
      USING (public.is_viewer(auth.uid()) OR public.is_tester(auth.uid()) OR public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trade_companies'
      AND policyname = 'Read-only users can read trade companies'
  ) THEN
    CREATE POLICY "Read-only users can read trade companies"
      ON public.trade_companies
      FOR SELECT
      TO authenticated
      USING (public.is_viewer(auth.uid()) OR public.is_tester(auth.uid()) OR public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trade_types'
      AND policyname = 'Read-only users can read trade types'
  ) THEN
    CREATE POLICY "Read-only users can read trade types"
      ON public.trade_types
      FOR SELECT
      TO authenticated
      USING (public.is_viewer(auth.uid()) OR public.is_tester(auth.uid()) OR public.is_admin(auth.uid()));
  END IF;
END $$;