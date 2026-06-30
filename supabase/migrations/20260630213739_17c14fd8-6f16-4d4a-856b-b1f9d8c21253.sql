
-- 1. sor_code_entries: restrict SELECT to admin only
DROP POLICY IF EXISTS "Authenticated users read SOR codes" ON public.sor_code_entries;

-- 2. subcontractors: remove tester from SELECT
DROP POLICY IF EXISTS "Read-only users can read subcontractors" ON public.subcontractors;
CREATE POLICY "Read-only users can read subcontractors"
  ON public.subcontractors FOR SELECT
  TO authenticated
  USING (is_viewer(auth.uid()) OR is_admin(auth.uid()));

-- 3. team_push_subscriptions: allow teams to read their own subscriptions
CREATE POLICY "Teams can view their own push subscriptions"
  ON public.team_push_subscriptions FOR SELECT
  USING (public.is_valid_team_id(team_id));

-- 4. job-attachments storage: remove public anon SELECT policy
DROP POLICY IF EXISTS "Anyone can view job attachments" ON storage.objects;

-- Allow validated team portals to read attachments in their own team folder
CREATE POLICY "Team portal can view job attachments (validated)"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'job-attachments'
    AND public.is_valid_team_id((storage.foldername(name))[1])
  );
