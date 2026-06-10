-- Field workers authenticate via PIN code in the Team Portal (no Supabase Auth session),
-- so they hit storage as the `anon` role. The job-attachments bucket is the dedicated
-- field-worker media store and is already public-read. Restore scoped anon write access
-- to this bucket ONLY, so uploads and sign-offs work again.

DROP POLICY IF EXISTS "Authenticated users can upload job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete job attachments" ON storage.objects;

CREATE POLICY "Field workers and users can upload job attachments"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'job-attachments');

CREATE POLICY "Field workers and users can delete job attachments"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'job-attachments');
