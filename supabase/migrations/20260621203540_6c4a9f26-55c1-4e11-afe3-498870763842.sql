
-- Drop the dangerous anon-write policies
DROP POLICY IF EXISTS "Team portal can upload job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Team portal can update job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Team portal can delete job attachments" ON storage.objects;

-- Authenticated users (admin / progressor / any signed-in user) keep full write access
CREATE POLICY "Authenticated can upload job attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'job-attachments');

CREATE POLICY "Authenticated can update job attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'job-attachments')
  WITH CHECK (bucket_id = 'job-attachments');

CREATE POLICY "Authenticated can delete job attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'job-attachments');

-- Team portal (anon) writes constrained to paths whose first folder segment
-- is a known active team_id. Random anon users have no valid team_id and
-- therefore cannot write.
CREATE POLICY "Team portal can upload job attachments (validated)"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND public.is_valid_team_id((storage.foldername(name))[1])
  );

CREATE POLICY "Team portal can update job attachments (validated)"
  ON storage.objects FOR UPDATE
  TO anon
  USING (
    bucket_id = 'job-attachments'
    AND public.is_valid_team_id((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND public.is_valid_team_id((storage.foldername(name))[1])
  );

CREATE POLICY "Team portal can delete job attachments (validated)"
  ON storage.objects FOR DELETE
  TO anon
  USING (
    bucket_id = 'job-attachments'
    AND public.is_valid_team_id((storage.foldername(name))[1])
  );
