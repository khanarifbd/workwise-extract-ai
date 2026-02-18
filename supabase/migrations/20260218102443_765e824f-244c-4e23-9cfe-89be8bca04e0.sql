-- Allow job progressors to delete sub-tasks
CREATE POLICY "Job progressors can delete sub tasks"
ON public.job_sub_tasks
FOR DELETE
USING (is_job_progressor(auth.uid()));