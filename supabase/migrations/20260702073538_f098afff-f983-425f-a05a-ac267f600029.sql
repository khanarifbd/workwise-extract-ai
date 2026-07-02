
CREATE POLICY "Testers manage job external assignees" ON public.job_external_assignees FOR ALL TO authenticated USING (public.is_tester(auth.uid())) WITH CHECK (public.is_tester(auth.uid()));
CREATE POLICY "Testers manage subcontractors" ON public.subcontractors FOR ALL TO authenticated USING (public.is_tester(auth.uid())) WITH CHECK (public.is_tester(auth.uid()));
