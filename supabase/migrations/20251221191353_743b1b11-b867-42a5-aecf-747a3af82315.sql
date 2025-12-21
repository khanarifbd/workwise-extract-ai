-- Make the job-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'job-attachments';

-- Drop existing public policies
DROP POLICY IF EXISTS "Public read access for job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public insert access for job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public delete access for job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public update access for job attachments" ON storage.objects;

-- Create authenticated policies for admins
CREATE POLICY "Admins can manage attachments"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'job-attachments' AND
  public.is_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'job-attachments' AND
  public.is_admin(auth.uid())
);

-- Allow anon uploads for team portal (validated by edge functions)
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-attachments');

-- Authenticated users can view attachments
CREATE POLICY "Authenticated users can view attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'job-attachments');