DROP POLICY IF EXISTS "Job progressors can view audit logs" ON public.audit_log;

DROP POLICY IF EXISTS "Field workers and users can upload job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Field workers and users can delete job attachments" ON storage.objects;

CREATE POLICY "Authenticated users can upload job attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-attachments');

CREATE POLICY "Authenticated users can delete job attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'job-attachments');

ALTER PUBLICATION supabase_realtime DROP TABLE public.subcontractors;