
INSERT INTO storage.buckets (id, name, public)
VALUES ('admin-avatars', 'admin-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view admin avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'admin-avatars');

CREATE POLICY "Authenticated admins can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'admin-avatars' AND has_admin_access(auth.uid()));

CREATE POLICY "Authenticated admins can update avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'admin-avatars' AND has_admin_access(auth.uid()));

CREATE POLICY "Authenticated admins can delete avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'admin-avatars' AND has_admin_access(auth.uid()));
