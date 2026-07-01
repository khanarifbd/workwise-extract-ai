
CREATE OR REPLACE FUNCTION public.is_tester(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(_user_id, 'tester'::public.app_role) $$;

CREATE POLICY "Testers can update jobs"
ON public.jobs FOR UPDATE
TO authenticated
USING (public.is_tester(auth.uid()))
WITH CHECK (public.is_tester(auth.uid()));

CREATE POLICY "Testers can insert jobs"
ON public.jobs FOR INSERT
TO authenticated
WITH CHECK (public.is_tester(auth.uid()));

CREATE POLICY "Testers can delete jobs"
ON public.jobs FOR DELETE
TO authenticated
USING (public.is_tester(auth.uid()));
