-- Create storage bucket for job attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-attachments',
  'job-attachments',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'video/mp4', 'video/webm', 'video/quicktime', 'video/avi', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
);

-- Allow public read access to job attachments
CREATE POLICY "Public read access for job attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'job-attachments');

-- Allow public insert access (since no auth in this app)
CREATE POLICY "Public insert access for job attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'job-attachments');

-- Allow public delete access
CREATE POLICY "Public delete access for job attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'job-attachments');