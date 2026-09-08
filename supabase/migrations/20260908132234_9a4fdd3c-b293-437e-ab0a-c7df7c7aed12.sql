CREATE POLICY "Viewers can update jobs"
ON public.jobs
FOR UPDATE
TO authenticated
USING (public.is_viewer(auth.uid()))
WITH CHECK (public.is_viewer(auth.uid()));