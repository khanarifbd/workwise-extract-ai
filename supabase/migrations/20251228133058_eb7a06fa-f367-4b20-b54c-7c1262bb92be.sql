-- Make job-attachments bucket public for accessing uploaded files
UPDATE storage.buckets SET public = true WHERE id = 'job-attachments';

-- Create storage policy for team members to upload files
CREATE POLICY "Anyone can upload job attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'job-attachments');

-- Create storage policy for viewing job attachments
CREATE POLICY "Anyone can view job attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'job-attachments');

-- Create storage policy for deleting own files
CREATE POLICY "Anyone can delete job attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'job-attachments');