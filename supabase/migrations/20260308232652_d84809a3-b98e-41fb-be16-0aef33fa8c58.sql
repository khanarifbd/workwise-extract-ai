
-- Allow job progressors to insert contact history
CREATE POLICY "Job progressors can insert contact history"
ON public.contact_history
FOR INSERT
TO authenticated
WITH CHECK (is_job_progressor(auth.uid()));

-- Allow job progressors to delete contact history
CREATE POLICY "Job progressors can delete contact history"
ON public.contact_history
FOR DELETE
TO authenticated
USING (is_job_progressor(auth.uid()));
