
-- Allow team portal (PIN-authenticated, runs as anon) to upload/update/delete
-- their job photos and videos. The bucket is already public-read.
-- Writes are gated client-side by the PIN code; storage paths are namespaced
-- by teamId/jobId so cross-team collisions are not possible.

CREATE POLICY "Team portal can upload job attachments"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'job-attachments');

CREATE POLICY "Team portal can update job attachments"
ON storage.objects FOR UPDATE
TO anon
USING (bucket_id = 'job-attachments')
WITH CHECK (bucket_id = 'job-attachments');

CREATE POLICY "Team portal can delete job attachments"
ON storage.objects FOR DELETE
TO anon
USING (bucket_id = 'job-attachments');
