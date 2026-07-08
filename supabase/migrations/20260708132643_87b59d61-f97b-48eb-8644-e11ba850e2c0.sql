
-- geocode_cache: replace broad "any authenticated" read with role-scoped policies
DROP POLICY IF EXISTS "Authenticated users can read geocode cache" ON public.geocode_cache;

CREATE POLICY "Testers can view geocode cache"
  ON public.geocode_cache
  FOR SELECT
  TO authenticated
  USING (public.is_tester(auth.uid()));

CREATE POLICY "Job progressors can view geocode cache"
  ON public.geocode_cache
  FOR SELECT
  TO authenticated
  USING (public.is_job_progressor(auth.uid()));

-- tester_section_permissions: replace USING(true) with role-scoped read
DROP POLICY IF EXISTS "Authenticated users can read tester permissions" ON public.tester_section_permissions;

CREATE POLICY "Admins can view tester permissions"
  ON public.tester_section_permissions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Testers can view tester permissions"
  ON public.tester_section_permissions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'tester'::public.app_role));
