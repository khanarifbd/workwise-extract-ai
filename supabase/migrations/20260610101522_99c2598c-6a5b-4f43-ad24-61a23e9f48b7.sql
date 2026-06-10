
-- Remove anon INSERT/DELETE policies on storage.objects for job-attachments bucket
DROP POLICY IF EXISTS "Anyone can upload job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete job attachments" ON storage.objects;

-- Replace with authenticated-only policies
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
