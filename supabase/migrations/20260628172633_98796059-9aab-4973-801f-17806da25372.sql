DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload job attachments" ON storage.objects;

CREATE POLICY "Admins can upload job attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'job-attachments' AND is_admin(auth.uid()));